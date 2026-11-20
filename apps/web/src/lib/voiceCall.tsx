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
import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
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

type SpeakerMediaDevices = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};

type OutputMediaElement = HTMLMediaElement & {
  setSinkId?: (id: string) => Promise<void>;
};

type ScreenShare = {
  stream: MediaStream;
  track: MediaStreamTrack;
  sender: RTCRtpSender;
  camera: MediaStreamTrack;
  ended: () => void;
};

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
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [speaker, setSpeaker] = useState<MediaDeviceInfo>();
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [tick, setTick] = useState(0);

  const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices as SpeakerMediaDevices | undefined;
  const canShareScreen = typeof mediaDevices?.getDisplayMedia === "function";
  const canSetSpeaker = typeof HTMLMediaElement !== "undefined"
    && typeof (HTMLMediaElement.prototype as OutputMediaElement).setSinkId === "function";
  const canPickSpeaker = canSetSpeaker && typeof mediaDevices?.selectAudioOutput === "function";
  const microphones = deviceList.filter((device) => device.kind === "audioinput");
  const speakers = deviceList.filter((device) => device.kind === "audiooutput");

  const screenShareRef = useRef<ScreenShare | null>(null);
  const screenBusyRef = useRef(false);
  const microphoneBusyRef = useRef(false);
  const speakerBusyRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const generationRef = useRef(0);
  const acceptingRef = useRef(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalIceRef = useRef<RTCIceCandidateInit[]>([]);
  const signalingReadyRef = useRef(false);
  const iceConfigRef = useRef<{ config: RTCConfiguration; expiresAt: number | null } | null>(null);
  const callRef = useRef<CallPhase>(call);
  callRef.current = call;

  const updateCall = useCallback((next: CallPhase) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    acceptingRef.current = false;
    const sharing = screenShareRef.current;
    screenShareRef.current = null;
    sharing?.track.removeEventListener("ended", sharing.ended);
    sharing?.stream.getTracks().forEach((track) => track.stop());
    screenBusyRef.current = false;
    microphoneBusyRef.current = false;
    speakerBusyRef.current = false;
    setDisplayStream(null);
    setScreenBusy(false);
    setDeviceList([]);
    setMicrophoneId("");
    setMicrophoneBusy(false);
    setSpeaker(undefined);
    setSpeakerBusy(false);
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingIceRef.current = [];
    pendingLocalIceRef.current = [];
    signalingReadyRef.current = false;
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
    async (conversationId: string, mode: CallMediaMode, generation: number): Promise<RTCPeerConnection | null> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      localStreamRef.current = stream;
      const config = await loadIceConfig();
      if (generation !== generationRef.current) return null;
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (pcRef.current !== pc) return;
          const candidate = event.candidate.toJSON();
          if (signalingReadyRef.current) getChatSocket()?.emit("call:ice", { conversationId, candidate });
          else if (pendingLocalIceRef.current.length < 128) pendingLocalIceRef.current.push(candidate);
        }
      };
      let fallbackRemoteStream: MediaStream | null = null;
      pc.ontrack = (event) => {
        if (pcRef.current !== pc) return;
        if (!event.streams[0]) {
          fallbackRemoteStream ??= new MediaStream();
          fallbackRemoteStream.addTrack(event.track);
        }
        const incoming = event.streams[0] ?? fallbackRemoteStream!;
        if (mode === "video") {
          setRemoteStream(incoming);
        } else {
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.srcObject = incoming;
          void audioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
        const terminate = () => {
          if (pcRef.current !== pc) return;
          const current = callRef.current;
          if (current.phase !== "idle") {
            getChatSocket()?.emit("call:end", { conversationId: current.conversationId });
            toast.error("Arama bağlantısı koptu.");
            cleanup();
          }
        };
        if (pc.connectionState === "failed") terminate();
        // Brief network changes can recover without ending a healthy call.
        if (pc.connectionState === "disconnected") {
          disconnectTimerRef.current = setTimeout(terminate, 10_000);
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
      if (!socket?.connected) {
        toast.error("Arama için sohbet bağlantısının kurulmasını bekleyin.");
        return;
      }
      const generation = ++generationRef.current;
      updateCall({ phase: "outgoing", conversationId, peerName, mode });
      try {
        const pc = await buildPeer(conversationId, mode, generation);
        if (!pc) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (generation !== generationRef.current) return;
        updateCall({ phase: "outgoing", conversationId, peerName, mode });
        socket.emit("call:invite", { conversationId, offer, mode }, (response: { ok?: boolean } | undefined) => {
          if (generation !== generationRef.current) return;
          if (response?.ok !== true) {
            toast.error("Arama başlatılamadı.");
            cleanup();
            return;
          }
          signalingReadyRef.current = true;
          for (const candidate of pendingLocalIceRef.current.splice(0)) socket.emit("call:ice", { conversationId, candidate });
        });
      } catch {
        if (generation !== generationRef.current) return;
        toast.error(`${mode === "video" ? "Kamera veya mikrofona" : "Mikrofona"} erişilemedi. Tarayıcı izinlerini kontrol edin.`);
        cleanup();
      }
    },
    [supported, buildPeer, cleanup, updateCall],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (current.phase !== "incoming" || acceptingRef.current) return;
    const socket = getChatSocket();
    if (!socket?.connected) return;
    acceptingRef.current = true;
    const generation = generationRef.current;
    try {
      const pc = await buildPeer(current.conversationId, current.mode, generation);
      if (!pc) return;
      await pc.setRemoteDescription(current.offer);
      if (generation !== generationRef.current) return;
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (generation !== generationRef.current) return;
      socket.emit("call:answer", { conversationId: current.conversationId, to: current.peerUserId, answer }, (response: { ok?: boolean } | undefined) => {
        if (generation !== generationRef.current) return;
        if (response?.ok !== true) { toast.error("Arama yanıtlanamadı."); cleanup(); return; }
        signalingReadyRef.current = true;
        for (const candidate of pendingLocalIceRef.current.splice(0)) socket.emit("call:ice", { conversationId: current.conversationId, candidate });
      });
      updateCall({
        phase: "active",
        conversationId: current.conversationId,
        peerUserId: current.peerUserId,
        peerName: current.peerName,
        startedAt: Date.now(),
        mode: current.mode,
      });
    } catch {
      if (generation !== generationRef.current) return;
      toast.error(`${current.mode === "video" ? "Kamera veya mikrofona" : "Mikrofona"} erişilemedi. Tarayıcı izinlerini kontrol edin.`);
      socket.emit("call:reject", { conversationId: current.conversationId });
      cleanup();
    } finally {
      if (generation === generationRef.current) acceptingRef.current = false;
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
    if (!stream || microphoneBusyRef.current) return;
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

  const stopScreenShare = useCallback(async () => {
    const sharing = screenShareRef.current;
    if (!sharing || screenBusyRef.current) return;
    const generation = generationRef.current;
    screenBusyRef.current = true;
    setScreenBusy(true);
    screenShareRef.current = null;
    sharing.track.removeEventListener("ended", sharing.ended);
    sharing.stream.getTracks().forEach((track) => track.stop());
    setDisplayStream(null);
    try {
      await sharing.sender.replaceTrack(sharing.camera);
    } catch {
      if (generation === generationRef.current) toast.error("Kamera görüntüsü geri getirilemedi.");
    } finally {
      if (generation === generationRef.current) {
        screenBusyRef.current = false;
        setScreenBusy(false);
      }
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    const current = callRef.current;
    if (current.phase !== "active" || current.mode !== "video" || screenBusyRef.current || screenShareRef.current) return;
    const devices = navigator.mediaDevices;
    if (!devices?.getDisplayMedia) return;
    const camera = localStreamRef.current?.getVideoTracks()[0];
    const sender = pcRef.current?.getSenders().find((candidate) => candidate.track?.kind === "video");
    if (!sender || !camera) return;
    const generation = generationRef.current;
    screenBusyRef.current = true;
    setScreenBusy(true);
    let stream: MediaStream | undefined;
    let registered = false;
    try {
      stream = await devices.getDisplayMedia({ video: true, audio: false });
      if (generation !== generationRef.current) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const ended = () => { void stopScreenShare(); };
      screenShareRef.current = { stream, track, sender, camera, ended };
      registered = true;
      await sender.replaceTrack(track);
      if (generation !== generationRef.current) return;
      if (track.readyState === "ended") {
        screenBusyRef.current = false;
        await stopScreenShare();
        return;
      }
      track.addEventListener("ended", ended, { once: true });
      setDisplayStream(stream);
    } catch (error) {
      if (generation === generationRef.current) {
        screenShareRef.current = null;
        registered = false;
        if (!(error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError"))) {
          toast.error("Ekran paylaşımı başlatılamadı.");
        }
      }
    } finally {
      if (!registered) stream?.getTracks().forEach((track) => track.stop());
      if (generation === generationRef.current) {
        screenBusyRef.current = false;
        setScreenBusy(false);
      }
    }
  }, [stopScreenShare]);

  useEffect(() => {
    if (call.phase !== "active" || typeof mediaDevices?.enumerateDevices !== "function") return;
    let active = true;
    const refreshDevices = () => {
      void mediaDevices.enumerateDevices().then((devices) => {
        if (!active) return;
        setDeviceList(devices.filter((device) => device.deviceId && device.deviceId !== "default"));
        setMicrophoneId(localStreamRef.current?.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      }).catch(() => {});
    };
    refreshDevices();
    mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      active = false;
      mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [call.phase, mediaDevices]);

  const changeMicrophone = useCallback(async (id: string) => {
    const stream = localStreamRef.current;
    const previous = stream?.getAudioTracks()[0];
    const sender = pcRef.current?.getSenders().find((candidate) => candidate.track?.kind === "audio");
    if (!stream || !previous || !sender || callRef.current.phase !== "active" || microphoneBusyRef.current) return;
    const generation = generationRef.current;
    microphoneBusyRef.current = true;
    setMicrophoneBusy(true);
    let replacement: MediaStream | undefined;
    let adopted: MediaStreamTrack | undefined;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({
        audio: id ? { deviceId: { exact: id } } : true,
        video: false,
      });
      if (generation !== generationRef.current) return;
      const track = replacement.getAudioTracks()[0];
      if (!track) throw new Error("Missing audio track");
      track.enabled = previous.enabled;
      await sender.replaceTrack(track);
      if (generation !== generationRef.current) return;
      stream.addTrack(track);
      stream.removeTrack(previous);
      previous.stop();
      adopted = track;
      setMicrophoneId(track.getSettings().deviceId ?? id);
    } catch {
      if (generation === generationRef.current) toast.error("Mikrofon değiştirilemedi.");
    } finally {
      replacement?.getTracks().forEach((track) => { if (track !== adopted) track.stop(); });
      if (generation === generationRef.current) {
        microphoneBusyRef.current = false;
        setMicrophoneBusy(false);
      }
    }
  }, []);

  const pickSpeaker = useCallback(async (selectedDevice?: MediaDeviceInfo | null) => {
    const current = callRef.current;
    if (current.phase !== "active" || speakerBusyRef.current) return;
    const devices = navigator.mediaDevices as SpeakerMediaDevices | undefined;
    const choose = devices?.selectAudioOutput?.bind(devices);
    if (selectedDevice === undefined && !choose) return;
    if (current.mode === "audio" && !audioRef.current) audioRef.current = new Audio();
    const output = (current.mode === "video" ? remoteVideoRef.current : audioRef.current) as OutputMediaElement | null;
    if (!output?.setSinkId) return;
    const generation = generationRef.current;
    speakerBusyRef.current = true;
    setSpeakerBusy(true);
    try {
      const device = selectedDevice === undefined ? await choose?.() : selectedDevice;
      if (generation !== generationRef.current) return;
      await output.setSinkId(device?.deviceId ?? "");
      if (generation === generationRef.current) setSpeaker(device ?? undefined);
    } catch (error) {
      if (generation === generationRef.current && !(selectedDevice === undefined && error instanceof DOMException && error.name === "NotAllowedError")) {
        toast.error("Ses çıkışı değiştirilemedi.");
      }
    } finally {
      if (generation === generationRef.current) {
        speakerBusyRef.current = false;
        setSpeakerBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    if (callMode(call) !== "video") return;
    if (localVideoRef.current) localVideoRef.current.srcObject = displayStream ?? localStreamRef.current;
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => {});
    }
  }, [call, displayStream, remoteStream]);

  useEffect(() => {
    if (!supported) return;
    const socket = getChatSocket();
    if (!socket) return;

    const onIncoming = (data: { conversationId: string; fromUserId: string; fromName: string; offer: RTCSessionDescriptionInit; mode?: CallMediaMode }) => {
      if (callRef.current.phase !== "idle") {
        socket.emit("call:reject", { conversationId: data.conversationId, reason: "busy" });
        return;
      }
      generationRef.current += 1;
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
      const generation = generationRef.current;
      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(data.answer);
        if (generation !== generationRef.current) return;
        await flushPendingIce(pc);
        if (generation !== generationRef.current) return;
        updateCall({
          phase: "active",
          conversationId: data.conversationId,
          peerUserId: data.fromUserId,
          peerName: current.peerName,
          startedAt: Date.now(),
          mode: current.mode,
        });
      } catch {
        if (generation === generationRef.current) cleanup();
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

  useEffect(() => () => {
    const current = callRef.current;
    if (current.phase !== "idle") {
      getChatSocket()?.emit(current.phase === "incoming" ? "call:reject" : "call:end", {
        conversationId: current.conversationId,
      });
    }
    cleanup();
  }, [cleanup]);

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
                  <button type="button" onClick={toggleMute} disabled={microphoneBusy} aria-label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${muted ? "bg-warning-soft text-warning" : "bg-card text-foreground"}`}>
                    {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                    {muted ? "Sessizde" : "Sustur"}
                  </button>
                )}
                {call.phase === "active" && microphones.length > 0 && (
                  <select
                    aria-label="Mikrofon seç"
                    className="h-9 max-w-40 rounded-lg border bg-card px-2 text-xs"
                    value={microphones.some((device) => device.deviceId === microphoneId) ? microphoneId : ""}
                    disabled={microphoneBusy}
                    onChange={(event) => void changeMicrophone(event.target.value)}
                  >
                    <option value="">Varsayılan mikrofon</option>
                    {microphones.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Mikrofon ${index + 1}`}</option>
                    ))}
                  </select>
                )}
                {call.phase === "active" && canPickSpeaker && (
                  <button type="button" onClick={() => void pickSpeaker()} disabled={speakerBusy} title={speaker?.label || undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium">
                    <Volume2 className="size-3.5" /> Ses çıkışı seç
                  </button>
                )}
                {call.phase === "active" && canSetSpeaker && !canPickSpeaker && speakers.length > 0 && (
                  <select
                    aria-label="Ses çıkışı seç"
                    className="h-9 max-w-40 rounded-lg border bg-card px-2 text-xs"
                    value={speakers.some((device) => device.deviceId === speaker?.deviceId) ? speaker?.deviceId : ""}
                    disabled={speakerBusy}
                    onChange={(event) => void pickSpeaker(speakers.find((device) => device.deviceId === event.target.value) ?? null)}
                  >
                    <option value="">Varsayılan ses çıkışı</option>
                    {speakers.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Ses çıkışı ${index + 1}`}</option>
                    ))}
                  </select>
                )}
                {call.phase === "active" && mode === "video" && (
                  <button type="button" onClick={toggleCamera} aria-label={cameraOff ? "Kamerayı aç" : "Kamerayı kapat"} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${cameraOff ? "bg-warning-soft text-warning" : "bg-card text-foreground"}`}>
                    {cameraOff ? <VideoOff className="size-3.5" /> : <Video className="size-3.5" />}
                    {cameraOff ? "Kamera kapalı" : "Kamerayı kapat"}
                  </button>
                )}
                {call.phase === "active" && mode === "video" && canShareScreen && (
                  <button
                    type="button"
                    aria-pressed={Boolean(displayStream)}
                    disabled={screenBusy}
                    onClick={() => void (displayStream ? stopScreenShare() : startScreenShare())}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium"
                  >
                    <MonitorUp className="size-3.5" />
                    {displayStream ? "Paylaşımı durdur" : "Ekranı paylaş"}
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
