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
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { chatRealtimeEnabled, getChatSocket } from "./chatRealtime";
import { chatService } from "./services";

/**
 * Birebir (DM) sesli/görüntülü arama. Medya WebRTC ile uçtan uca eşler
 * arasında akar; sohbet soketi yalnız SDP/ICE sinyalleşmesini taşır.
 */
const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type CallMediaMode = "audio" | "video";

type CallPhase =
  | { phase: "idle" }
  | { phase: "incoming"; conversationId: string; peerUserId: string; peerName: string; offer: RTCSessionDescriptionInit; mode: CallMediaMode }
  | { phase: "outgoing"; conversationId: string; peerName: string; mode: CallMediaMode }
  | { phase: "active"; conversationId: string; peerUserId: string | null; peerName: string; startedAt: number; mode: CallMediaMode };

type VoiceCallApi = {
  supported: boolean;
  phase: CallPhase["phase"];
  startCall: (conversationId: string, peerName: string, mode?: CallMediaMode) => Promise<void>;
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
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function callMode(call: CallPhase): CallMediaMode | null {
  return call.phase === "idle" ? null : call.mode;
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const supported =
    chatRealtimeEnabled()
    && typeof RTCPeerConnection !== "undefined"
    && typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia);
  const [call, setCall] = useState<CallPhase>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [tick, setTick] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const iceConfigRef = useRef<{ config: RTCConfiguration; expiresAt: number | null } | null>(null);
  const callRef = useRef<CallPhase>(call);
  callRef.current = call;

  const updateCall = useCallback((next: CallPhase) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingIceRef.current = [];
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    updateCall({ phase: "idle" });
  }, [updateCall]);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.splice(0);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Tek bir geçersiz aday, kalan adayların işlenmesini engellemez.
      }
    }
  }, []);

  const loadIceConfig = useCallback(async (): Promise<RTCConfiguration> => {
    const cached = iceConfigRef.current;
    if (cached && (cached.expiresAt === null || cached.expiresAt > Date.now() + 60_000)) {
      return cached.config;
    }
    try {
      const response = await chatService.webrtcConfig();
      const config = {
        iceServers: response.iceServers?.length
          ? response.iceServers
          : DEFAULT_ICE_SERVERS.iceServers,
      };
      iceConfigRef.current = {
        config,
        expiresAt: response.expiresAt ? new Date(response.expiresAt).getTime() : null,
      };
      return config;
    } catch {
      return DEFAULT_ICE_SERVERS;
    }
  }, []);

  const buildPeer = useCallback(
    async (conversationId: string, mode: CallMediaMode): Promise<RTCPeerConnection> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(await loadIceConfig());
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          getChatSocket()?.emit("call:ice", { conversationId, candidate: event.candidate.toJSON() });
        }
      };
      pc.ontrack = (event) => {
        const incoming = event.streams[0];
        if (mode === "video") {
          setRemoteStream(incoming);
        } else {
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.srcObject = incoming;
          void audioRef.current.play().catch(() => {});
        }
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
    [cleanup, loadIceConfig],
  );

  const startCall = useCallback(
    async (conversationId: string, peerName: string, mode: CallMediaMode = "audio") => {
      if (!supported || callRef.current.phase !== "idle") return;
      const socket = getChatSocket();
      if (!socket) return;
      try {
        const pc = await buildPeer(conversationId, mode);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        updateCall({ phase: "outgoing", conversationId, peerName, mode });
        socket.emit("call:invite", { conversationId, offer, mode }, (response: { ok?: boolean } | undefined) => {
          if (response && response.ok === false) {
            toast.error("Arama başlatılamadı.");
            cleanup();
          }
        });
      } catch {
        toast.error(`${mode === "video" ? "Kamera veya mikrofona" : "Mikrofona"} erişilemedi. Tarayıcı izinlerini kontrol edin.`);
        cleanup();
      }
    },
    [supported, buildPeer, cleanup, updateCall],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (current.phase !== "incoming") return;
    const socket = getChatSocket();
    if (!socket) return;
    try {
      const pc = await buildPeer(current.conversationId, current.mode);
      await pc.setRemoteDescription(current.offer);
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", { conversationId: current.conversationId, to: current.peerUserId, answer });
      updateCall({
        phase: "active",
        conversationId: current.conversationId,
        peerUserId: current.peerUserId,
        peerName: current.peerName,
        startedAt: Date.now(),
        mode: current.mode,
      });
    } catch {
      toast.error(`${current.mode === "video" ? "Kamera veya mikrofona" : "Mikrofona"} erişilemedi. Tarayıcı izinlerini kontrol edin.`);
      socket.emit("call:reject", { conversationId: current.conversationId });
      cleanup();
    }
  }, [buildPeer, cleanup, flushPendingIce, updateCall]);

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
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  }, [cameraOff]);

  useEffect(() => {
    if (callMode(call) !== "video") return;
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => {});
    }
  }, [call, remoteStream]);

  useEffect(() => {
    if (!supported) return;
    const socket = getChatSocket();
    if (!socket) return;

    const onIncoming = (data: { conversationId: string; fromUserId: string; fromName: string; offer: RTCSessionDescriptionInit; mode?: CallMediaMode }) => {
      if (callRef.current.phase !== "idle") {
        socket.emit("call:reject", { conversationId: data.conversationId, reason: "busy" });
        return;
      }
      updateCall({
        phase: "incoming",
        conversationId: data.conversationId,
        peerUserId: data.fromUserId,
        peerName: data.fromName,
        offer: data.offer,
        mode: data.mode === "video" ? "video" : "audio",
      });
    };
    const onAnswer = async (data: { conversationId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const current = callRef.current;
      if (current.phase !== "outgoing" || current.conversationId !== data.conversationId) return;
      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(data.answer);
        await flushPendingIce(pc);
        updateCall({
          phase: "active",
          conversationId: data.conversationId,
          peerUserId: data.fromUserId,
          peerName: current.peerName,
          startedAt: Date.now(),
          mode: current.mode,
        });
      } catch {
        cleanup();
      }
    };
    const onIce = async (data: { conversationId: string; candidate: RTCIceCandidateInit }) => {
      const current = callRef.current;
      if (current.phase === "idle" || current.conversationId !== data.conversationId) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        if (pendingIceRef.current.length < 128) pendingIceRef.current.push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        // Geçersiz tek bir aday, bağlantının diğer adaylarla kurulmasını engellemez.
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
    const onDisconnect = () => {
      if (callRef.current.phase !== "idle") {
        toast.error("Arama bağlantısı kesildi.");
        cleanup();
      }
    };
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.off("call:reject", onReject);
      socket.off("call:end", onEnd);
      socket.off("disconnect", onDisconnect);
    };
  }, [supported, cleanup, flushPendingIce, updateCall]);

  useEffect(() => {
    if (call.phase !== "outgoing" && call.phase !== "incoming") return;
    const timeoutId = window.setTimeout(() => {
      const current = callRef.current;
      if (current.phase === "outgoing") {
        getChatSocket()?.emit("call:end", { conversationId: current.conversationId });
        toast.info("Arama yanıtlanmadı.");
      } else if (current.phase === "incoming") {
        getChatSocket()?.emit("call:reject", { conversationId: current.conversationId, reason: "timeout" });
      }
      cleanup();
    }, 45_000);
    return () => window.clearTimeout(timeoutId);
  }, [call.phase, cleanup]);

  useEffect(() => {
    if (call.phase !== "active") return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [call.phase]);
  void tick;

  const api = useMemo<VoiceCallApi>(
    () => ({ supported, phase: call.phase, startCall }),
    [supported, call.phase, startCall],
  );

  const mode = callMode(call);

  return (
    <VoiceCallContext.Provider value={api}>
      {children}
      {call.phase !== "idle" && (
        <div
          role="dialog"
          aria-label={`${mode === "video" ? "Görüntülü" : "Sesli"} arama`}
          className={`fixed inset-x-2 bottom-2 z-[70] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-xl border bg-card p-3 shadow-xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:p-4 ${
            mode === "video" ? "sm:w-[min(32rem,calc(100vw-2rem))]" : "sm:w-72"
          }`}
        >
          {mode === "video" && call.phase !== "incoming" && (
            <div className="relative mb-3 aspect-video max-h-[58dvh] overflow-hidden rounded-lg bg-slate-950">
              <video ref={remoteVideoRef} autoPlay playsInline className="size-full object-cover" />
              {!remoteStream && <div className="absolute inset-0 grid place-items-center text-xs text-white/70">Görüntü bağlantısı bekleniyor…</div>}
              <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-2 right-2 aspect-video w-20 rounded-md border border-white/30 bg-black object-cover shadow-lg sm:w-28" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${call.phase === "incoming" ? "animate-pulse bg-success-soft text-success" : "bg-brand-blue-soft text-primary"}`}>
              {mode === "video" ? <Video className="size-4" /> : <Phone className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{call.peerName}</div>
              <div className="text-xs text-muted-foreground">
                {call.phase === "incoming" && `${mode === "video" ? "Görüntülü" : "Sesli"} arama geliyor…`}
                {call.phase === "outgoing" && "Aranıyor…"}
                {call.phase === "active" && formatDuration(call.startedAt)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {call.phase === "incoming" ? (
              <>
                <button type="button" onClick={rejectCall} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground">
                  <PhoneOff className="size-3.5" /> Reddet
                </button>
                <button type="button" onClick={() => void acceptCall()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-medium text-success-foreground">
                  {mode === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />} Yanıtla
                </button>
              </>
            ) : (
              <>
                {call.phase === "active" && (
                  <button type="button" onClick={toggleMute} aria-label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${muted ? "bg-warning-soft text-warning" : "bg-card text-foreground"}`}>
                    {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                    {muted ? "Sessizde" : "Sustur"}
                  </button>
                )}
                {call.phase === "active" && mode === "video" && (
                  <button type="button" onClick={toggleCamera} aria-label={cameraOff ? "Kamerayı aç" : "Kamerayı kapat"} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${cameraOff ? "bg-warning-soft text-warning" : "bg-card text-foreground"}`}>
                    {cameraOff ? <VideoOff className="size-3.5" /> : <Video className="size-3.5" />}
                    {cameraOff ? "Kamera kapalı" : "Kamerayı kapat"}
                  </button>
                )}
                <button type="button" onClick={hangUp} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground">
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
