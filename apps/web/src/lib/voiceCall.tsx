import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { chatRealtimeEnabled, getChatSocket } from "./chatRealtime";

/**
 * Birebir (DM) sesli arama — WebRTC peer-to-peer, sinyalleşme sohbet soketi
 * üzerinden. Medya sunucuya uğramaz; STUN ile NAT çözümü yapılır. Sağlayıcı
 * Layout'a bir kez monte edilir ki gelen arama uygulamanın her yerinde çalsın.
 */

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type CallPhase =
  | { phase: "idle" }
  | { phase: "incoming"; conversationId: string; peerUserId: string; peerName: string; offer: RTCSessionDescriptionInit }
  | { phase: "outgoing"; conversationId: string; peerName: string }
  | { phase: "active"; conversationId: string; peerUserId: string | null; peerName: string; startedAt: number };

type VoiceCallApi = {
  supported: boolean;
  phase: CallPhase["phase"];
  startCall: (conversationId: string, peerName: string) => Promise<void>;
};

const VoiceCallContext = createContext<VoiceCallApi>({
  supported: false,
  phase: "idle",
  startCall: async () => {},
});

export function useVoiceCall(): VoiceCallApi {
  return useContext(VoiceCallContext);
}

function formatDuration(startedAt: number): string {
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const supported = chatRealtimeEnabled() && typeof RTCPeerConnection !== "undefined";
  const [call, setCall] = useState<CallPhase>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const [tick, setTick] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<CallPhase>(call);
  callRef.current = call;

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setMuted(false);
    setCall({ phase: "idle" });
  }, []);

  const buildPeer = useCallback(
    async (conversationId: string): Promise<RTCPeerConnection> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          getChatSocket()?.emit("call:ice", { conversationId, candidate: e.candidate.toJSON() });
        }
      };
      pc.ontrack = (e) => {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.srcObject = e.streams[0];
        void audioRef.current.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          const current = callRef.current;
          if (current.phase === "active" || current.phase === "outgoing") {
            toast.error("Arama bağlantısı koptu.");
            cleanup();
          }
        }
      };
      return pc;
    },
    [cleanup],
  );

  const startCall = useCallback(
    async (conversationId: string, peerName: string) => {
      if (!supported || callRef.current.phase !== "idle") return;
      const socket = getChatSocket();
      if (!socket) return;
      try {
        const pc = await buildPeer(conversationId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        setCall({ phase: "outgoing", conversationId, peerName });
        socket.emit("call:invite", { conversationId, offer }, (res: { ok?: boolean } | undefined) => {
          if (res && res.ok === false) {
            toast.error("Arama başlatılamadı.");
            cleanup();
          }
        });
      } catch {
        toast.error("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin.");
        cleanup();
      }
    },
    [supported, buildPeer, cleanup],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (current.phase !== "incoming") return;
    const socket = getChatSocket();
    if (!socket) return;
    try {
      const pc = await buildPeer(current.conversationId);
      await pc.setRemoteDescription(current.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", { conversationId: current.conversationId, to: current.peerUserId, answer });
      setCall({
        phase: "active",
        conversationId: current.conversationId,
        peerUserId: current.peerUserId,
        peerName: current.peerName,
        startedAt: Date.now(),
      });
    } catch {
      toast.error("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin.");
      socket.emit("call:reject", { conversationId: current.conversationId });
      cleanup();
    }
  }, [buildPeer, cleanup]);

  const rejectCall = useCallback(() => {
    const current = callRef.current;
    if (current.phase !== "incoming") return;
    getChatSocket()?.emit("call:reject", { conversationId: current.conversationId });
    cleanup();
  }, [cleanup]);

  const hangUp = useCallback(() => {
    const current = callRef.current;
    if (current.phase === "outgoing" || current.phase === "active") {
      getChatSocket()?.emit("call:end", { conversationId: current.conversationId });
    }
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  // Soket olayları — sağlayıcı ömrü boyunca dinlenir.
  useEffect(() => {
    if (!supported) return;
    const socket = getChatSocket();
    if (!socket) return;

    const onIncoming = (data: { conversationId: string; fromUserId: string; fromName: string; offer: RTCSessionDescriptionInit }) => {
      if (callRef.current.phase !== "idle") {
        socket.emit("call:reject", { conversationId: data.conversationId, reason: "busy" });
        return;
      }
      setCall({
        phase: "incoming",
        conversationId: data.conversationId,
        peerUserId: data.fromUserId,
        peerName: data.fromName,
        offer: data.offer,
      });
    };
    const onAnswer = async (data: { conversationId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const current = callRef.current;
      if (current.phase !== "outgoing" || current.conversationId !== data.conversationId) return;
      try {
        await pcRef.current?.setRemoteDescription(data.answer);
        setCall({
          phase: "active",
          conversationId: data.conversationId,
          peerUserId: data.fromUserId,
          peerName: current.peerName,
          startedAt: Date.now(),
        });
      } catch {
        cleanup();
      }
    };
    const onIce = async (data: { conversationId: string; candidate: RTCIceCandidateInit }) => {
      const current = callRef.current;
      if (current.phase === "idle" || current.conversationId !== data.conversationId) return;
      try {
        await pcRef.current?.addIceCandidate(data.candidate);
      } catch {
        // Erken gelen aday sessizce yoksayılır; bağlantı diğer adaylarla kurulur.
      }
    };
    const onReject = (data: { conversationId: string; reason?: string }) => {
      const current = callRef.current;
      if (current.phase === "idle" || current.conversationId !== data.conversationId) return;
      toast.info(data.reason === "busy" ? "Karşı taraf başka bir aramada." : "Arama reddedildi.");
      cleanup();
    };
    const onEnd = (data: { conversationId: string }) => {
      const current = callRef.current;
      if (current.phase === "idle" || current.conversationId !== data.conversationId) return;
      cleanup();
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice", onIce);
    socket.on("call:reject", onReject);
    socket.on("call:end", onEnd);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.off("call:reject", onReject);
      socket.off("call:end", onEnd);
    };
  }, [supported, cleanup]);

  // Aktif aramada süre göstergesini saniyede bir tazele.
  useEffect(() => {
    if (call.phase !== "active") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [call.phase]);
  void tick;

  const api = useMemo<VoiceCallApi>(
    () => ({ supported, phase: call.phase, startCall }),
    [supported, call.phase, startCall],
  );

  return (
    <VoiceCallContext.Provider value={api}>
      {children}
      {call.phase !== "idle" && (
        <div className="fixed bottom-24 right-4 z-[70] w-72 rounded-xl border bg-card p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${call.phase === "incoming" ? "animate-pulse bg-success-soft text-success" : "bg-brand-blue-soft text-primary"}`}>
              <Phone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{call.peerName}</div>
              <div className="text-xs text-muted-foreground">
                {call.phase === "incoming" && "Sesli arama geliyor…"}
                {call.phase === "outgoing" && "Aranıyor…"}
                {call.phase === "active" && formatDuration(call.startedAt)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {call.phase === "incoming" ? (
              <>
                <button
                  type="button"
                  onClick={rejectCall}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground"
                >
                  <PhoneOff className="size-3.5" /> Reddet
                </button>
                <button
                  type="button"
                  onClick={() => void acceptCall()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-medium text-success-foreground"
                >
                  <Phone className="size-3.5" /> Yanıtla
                </button>
              </>
            ) : (
              <>
                {call.phase === "active" && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${muted ? "bg-warning-soft text-warning" : "bg-card text-foreground"}`}
                  >
                    {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                    {muted ? "Sessizde" : "Sustur"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={hangUp}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground"
                >
                  <PhoneOff className="size-3.5" /> Kapat
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </VoiceCallContext.Provider>
  );
}
