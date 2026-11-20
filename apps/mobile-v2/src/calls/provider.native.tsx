import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Modal, NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import type { MediaStream, RTCPeerConnection, RTCIceCandidate, MediaStreamTrack } from 'react-native-webrtc';
import { request } from '@/src/api/client';
import { getChatCallSocket, retainChatCallSocket } from '@/src/realtime/chat';
import { callAnswerSchema, callEndSchema, callIceSchema, iceConfigurationSchema, incomingCallSchema } from './protocol';
import type { CallMediaMode, CallPhase, NativeCallApi, NativeCallProviderProps } from './types';

// Expo Go and an older binary can mount the app without loading unavailable native code.
const nativeAvailable = Boolean(NativeModules.WebRTCModule && NativeModules.InCallManager);
const rtc: typeof import('react-native-webrtc') | null = nativeAvailable ? require('react-native-webrtc') : null;
// The native API accepts null to restore automatic routing; its published type omits it.
type AudioManager = Omit<typeof import('react-native-incall-manager').default, 'setForceSpeakerphoneOn'> & {
  setForceSpeakerphoneOn: (enabled: boolean | null) => void;
};
const audio: AudioManager | null = nativeAvailable
  ? require('react-native-incall-manager').default
  : null;
const NativeCallContext = createContext<NativeCallApi>({ supported: false, phase: 'idle', startCall: async () => {} });
type Description = { type: 'offer' | 'answer'; sdp: string };
type Candidate = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
// WebRTC 124's declarations import an unexported event-target-shim/index path.
// Describe the native events here until that upstream declaration is corrected.
type NativePeerEvents = {
  addEventListener(type: 'icecandidate', listener: (event: { candidate: RTCIceCandidate | null }) => void): void;
  addEventListener(type: 'track', listener: (event: { track: MediaStreamTrack | null; streams: MediaStream[] }) => void): void;
  addEventListener(type: 'connectionstatechange', listener: () => void): void;
};
type Call = {
  phase: CallPhase;
  conversationId: string;
  peerName: string;
  peerUserId?: string;
  mode: CallMediaMode;
  offer?: Description;
  startedAt?: number;
};
const idleCall: Call = { phase: 'idle', conversationId: '', peerName: '', mode: 'audio' };

function duration(startedAt?: number): string {
  const seconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function NativeCallProvider({ children, userId }: NativeCallProviderProps) {
  const [call, setCall] = useState<Call>(idleCall);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [, setTick] = useState(0);
  const current = useRef<Call>(idleCall);
  const peer = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remote = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const acceptingRef = useRef(false);
  const answeringRef = useRef(false);
  const cameraBusy = useRef(false);
  const signalingReady = useRef(false);
  const pendingLocalIce = useRef<Candidate[]>([]);
  const pendingRemoteIce = useRef<Candidate[]>([]);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStarted = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const releaseSocket = useRef<(() => void) | null>(null);
  const supported = Boolean(userId && rtc && audio);

  const updateCall = useCallback((next: Call) => {
    current.current = next;
    setCall(next);
  }, []);

  const cleanup = useCallback(() => {
    generation.current += 1;
    const previousPeer = peer.current;
    peer.current = null;
    previousPeer?.close();
    local.current?.getTracks().forEach(track => track.stop());
    local.current?.release();
    local.current = null;
    remote.current = null;
    pendingLocalIce.current = [];
    pendingRemoteIce.current = [];
    signalingReady.current = false;
    acceptingRef.current = false;
    answeringRef.current = false;
    cameraBusy.current = false;
    const release = releaseSocket.current;
    releaseSocket.current = null;
    release?.();
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    phaseTimer.current = null;
    disconnectTimer.current = null;
    audio?.stopRingtone();
    if (audioStarted.current) {
      audioStarted.current = false;
      audio?.setForceSpeakerphoneOn(null);
      audio?.stop();
    }
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setSpeaker(false);
    setCameraOff(false);
    setFrontCamera(true);
    setAccepting(false);
    updateCall(idleCall);
  }, [updateCall]);

  const finish = useCallback((notify = true) => {
    const previous = current.current;
    if (notify && previous.phase !== 'idle') {
      socketRef.current?.emit(previous.phase === 'incoming' ? 'call:reject' : 'call:end', {
        conversationId: previous.conversationId,
      });
    }
    cleanup();
  }, [cleanup]);

  const armTimeout = useCallback((milliseconds: number, message: string) => {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    const token = generation.current;
    phaseTimer.current = setTimeout(() => {
      if (generation.current !== token || current.current.phase === 'idle' || current.current.phase === 'active') return;
      finish();
      Alert.alert('Arama', message);
    }, milliseconds);
  }, [finish]);

  const sendPendingLocalIce = useCallback(() => {
    signalingReady.current = true;
    const conversationId = current.current.conversationId;
    for (const candidate of pendingLocalIce.current.splice(0)) {
      socketRef.current?.emit('call:ice', { conversationId, candidate });
    }
  }, []);

  const flushRemoteIce = useCallback(async (connection: RTCPeerConnection) => {
    for (const candidate of pendingRemoteIce.current.splice(0)) {
      if (peer.current !== connection) return;
      try {
        await connection.addIceCandidate(new rtc!.RTCIceCandidate(candidate));
      } catch {
        // Another candidate can establish the connection if one candidate expires.
      }
    }
  }, []);

  const buildPeer = useCallback(async (snapshot: Call, token: number) => {
    if (!rtc || !audio) return null;
    const configuration = await request('/chat/webrtc-config', { schema: iceConfigurationSchema });
    if (generation.current !== token) return null;
    const stream = await rtc.mediaDevices.getUserMedia({
      audio: true,
      video: snapshot.mode === 'video' ? { facingMode: 'user', width: 640, height: 480, frameRate: 24 } : false,
    });
    if (generation.current !== token) {
      stream.getTracks().forEach(track => track.stop());
      stream.release();
      return null;
    }
    local.current = stream;
    setLocalStream(stream);
    audio.start({ media: snapshot.mode, auto: true });
    audioStarted.current = true;
    setSpeaker(snapshot.mode === 'video');
    const connection = new rtc.RTCPeerConnection({ iceServers: configuration.iceServers }) as RTCPeerConnection & NativePeerEvents;
    peer.current = connection;
    stream.getTracks().forEach(track => connection.addTrack(track, stream));
    connection.addEventListener('icecandidate', event => {
      if (peer.current !== connection || !event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (signalingReady.current) socketRef.current?.emit('call:ice', { conversationId: snapshot.conversationId, candidate });
      else if (pendingLocalIce.current.length < 128) pendingLocalIce.current.push(candidate);
    });
    connection.addEventListener('track', event => {
      const track = event.track;
      if (peer.current !== connection || !track) return;
      const received = event.streams[0] ?? remote.current ?? new rtc.MediaStream();
      if (!event.streams[0] && !received.getTracks().some(existing => existing.id === track.id)) received.addTrack(track);
      remote.current = received;
      setRemoteStream(received);
    });
    connection.addEventListener('connectionstatechange', () => {
      if (peer.current !== connection) return;
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
      if (connection.connectionState === 'connected') {
        if (phaseTimer.current) clearTimeout(phaseTimer.current);
        phaseTimer.current = null;
        updateCall({ ...current.current, phase: 'active', startedAt: current.current.startedAt ?? Date.now() });
      } else if (connection.connectionState === 'failed') {
        finish();
        Alert.alert('Arama', 'Arama bağlantısı kurulamadı. Ağ bağlantınızı kontrol edin.');
      } else if (connection.connectionState === 'disconnected') {
        disconnectTimer.current = setTimeout(() => {
          if (peer.current !== connection) return;
          finish();
          Alert.alert('Arama', 'Arama bağlantısı kesildi.');
        }, 10_000);
      }
    });
    return connection;
  }, [finish, updateCall]);

  const startCall = useCallback(async (conversationId: string, peerName: string, mode: CallMediaMode = 'audio') => {
    if (!supported || current.current.phase !== 'idle') return;
    const socket = getChatCallSocket();
    if (!socket?.connected) {
      Alert.alert('Arama', 'Aramak için sohbet bağlantısının kurulmasını bekleyin.');
      return;
    }
    socketRef.current = socket;
    const token = ++generation.current;
    releaseSocket.current = retainChatCallSocket();
    const snapshot: Call = { phase: 'outgoing', conversationId, peerName, mode };
    updateCall(snapshot);
    armTimeout(45_000, 'Arama yanıtlanmadı.');
    try {
      const connection = await buildPeer(snapshot, token);
      if (!connection || generation.current !== token) return;
      const offer = await connection.createOffer();
      if (generation.current !== token) return;
      await connection.setLocalDescription(offer);
      if (generation.current !== token) return;
      socket.timeout(10_000).emit('call:invite', { conversationId, offer, mode }, (error: Error | null, response?: { ok?: boolean }) => {
        if (generation.current !== token) return;
        if (error || response?.ok !== true) {
          finish();
          Alert.alert('Arama', 'Arama isteği karşı tarafa iletilemedi.');
          return;
        }
        sendPendingLocalIce();
      });
    } catch {
      if (generation.current !== token) return;
      finish();
      Alert.alert('Arama', 'Arama başlatılamadı. Mikrofon, kamera ve ağ izinlerini kontrol edin.');
    }
  }, [armTimeout, buildPeer, finish, sendPendingLocalIce, supported, updateCall]);

  const acceptCall = useCallback(async () => {
    const snapshot = current.current;
    const socket = socketRef.current;
    if (snapshot.phase !== 'incoming' || !snapshot.offer || !socket?.connected || acceptingRef.current || !rtc) return;
    acceptingRef.current = true;
    setAccepting(true);
    const token = generation.current;
    audio?.stopRingtone();
    try {
      const connection = await buildPeer(snapshot, token);
      if (!connection || generation.current !== token) return;
      await connection.setRemoteDescription(new rtc.RTCSessionDescription(snapshot.offer));
      if (generation.current !== token) return;
      await flushRemoteIce(connection);
      if (generation.current !== token) return;
      const answer = await connection.createAnswer();
      if (generation.current !== token) return;
      await connection.setLocalDescription(answer);
      if (generation.current !== token) return;
      if (current.current.phase !== 'active') {
        updateCall({ ...snapshot, phase: 'connecting' });
        armTimeout(30_000, 'Arama bağlantısı kurulamadı.');
      }
      socket.timeout(10_000).emit('call:answer', { conversationId: snapshot.conversationId, to: snapshot.peerUserId, answer }, (error: Error | null, response?: { ok?: boolean }) => {
        if (generation.current !== token) return;
        if (error || response?.ok !== true) {
          finish();
          Alert.alert('Arama', 'Arama yanıtı iletilemedi.');
          return;
        }
        sendPendingLocalIce();
      });
    } catch {
      if (generation.current !== token) return;
      finish();
      Alert.alert('Arama', 'Arama kabul edilemedi. Mikrofon ve kamera izinlerini kontrol edin.');
    } finally {
      if (generation.current === token) {
        acceptingRef.current = false;
        setAccepting(false);
      }
    }
  }, [armTimeout, buildPeer, finish, flushRemoteIce, sendPendingLocalIce, updateCall]);

  useEffect(() => {
    if (!supported || !userId || !rtc) return;
    const socket = getChatCallSocket();
    if (!socket) return;
    socketRef.current = socket;
    const onIncoming = (payload: unknown) => {
      const parsed = incomingCallSchema.safeParse(payload);
      if (!parsed.success || parsed.data.fromUserId === userId) return;
      const data = parsed.data;
      if (current.current.phase !== 'idle') {
        socket.emit('call:reject', { conversationId: data.conversationId, reason: 'busy' });
        return;
      }
      generation.current += 1;
      releaseSocket.current = retainChatCallSocket();
      updateCall({ phase: 'incoming', conversationId: data.conversationId, peerUserId: data.fromUserId, peerName: data.fromName, offer: data.offer, mode: data.mode });
      audio?.startRingtone('_DEFAULT_', [0, 500, 1000], 'default', 45);
      armTimeout(45_000, 'Cevapsız arama.');
    };
    const onAnswer = async (payload: unknown) => {
      const parsed = callAnswerSchema.safeParse(payload);
      const snapshot = current.current;
      const connection = peer.current;
      if (!parsed.success || snapshot.phase !== 'outgoing' || parsed.data.conversationId !== snapshot.conversationId || !connection || answeringRef.current) return;
      answeringRef.current = true;
      const token = generation.current;
      try {
        await connection.setRemoteDescription(new rtc.RTCSessionDescription(parsed.data.answer));
        if (generation.current !== token) return;
        await flushRemoteIce(connection);
        if (generation.current !== token) return;
        if (current.current.phase !== 'active') {
          updateCall({ ...snapshot, peerUserId: parsed.data.fromUserId, phase: 'connecting' });
          armTimeout(30_000, 'Arama bağlantısı kurulamadı.');
        }
      } catch {
        if (generation.current === token) finish();
      } finally {
        if (generation.current === token) answeringRef.current = false;
      }
    };
    const onIce = async (payload: unknown) => {
      const parsed = callIceSchema.safeParse(payload);
      const snapshot = current.current;
      if (!parsed.success || snapshot.phase === 'idle' || parsed.data.conversationId !== snapshot.conversationId) return;
      if (snapshot.peerUserId && parsed.data.fromUserId !== snapshot.peerUserId) return;
      const connection = peer.current;
      if (!connection?.remoteDescription) {
        if (pendingRemoteIce.current.length < 128) pendingRemoteIce.current.push(parsed.data.candidate);
        return;
      }
      try {
        await connection.addIceCandidate(new rtc.RTCIceCandidate(parsed.data.candidate));
      } catch {
        // An expired candidate does not invalidate the remaining ICE candidates.
      }
    };
    const onEnd = (payload: unknown) => {
      const parsed = callEndSchema.safeParse(payload);
      const snapshot = current.current;
      if (!parsed.success || snapshot.phase === 'idle' || parsed.data.conversationId !== snapshot.conversationId) return;
      if (snapshot.peerUserId && parsed.data.fromUserId !== snapshot.peerUserId) return;
      finish(false);
    };
    const onDisconnect = () => {
      if (current.current.phase === 'idle') return;
      finish(false);
      Alert.alert('Arama', 'Sohbet bağlantısı kesildi.');
    };
    socket.on('call:incoming', onIncoming);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:reject', onEnd);
    socket.on('call:end', onEnd);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:reject', onEnd);
      socket.off('call:end', onEnd);
      socket.off('disconnect', onDisconnect);
      finish();
      socketRef.current = null;
    };
  }, [armTimeout, finish, flushRemoteIce, supported, updateCall, userId]);

  useEffect(() => {
    if (call.phase !== 'active') return;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [call.phase]);

  useEffect(() => {
    const route = DeviceEventEmitter.addListener('onAudioDeviceChanged', (event: { selectedAudioDevice?: string }) => {
      if (current.current.phase === 'idle' || !event.selectedAudioDevice) return;
      setSpeaker(event.selectedAudioDevice === 'SPEAKER_PHONE');
    });
    const headset = DeviceEventEmitter.addListener('WiredHeadset', (event: { isPlugged?: boolean }) => {
      if (!audioStarted.current) return;
      audio?.setForceSpeakerphoneOn(null);
      if (event.isPlugged) setSpeaker(false);
    });
    return () => { route.remove(); headset.remove(); };
  }, []);

  const toggleMute = () => {
    const stream = local.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleSpeaker = () => {
    if (!audioStarted.current || !audio) return;
    const next = !speaker;
    audio.setForceSpeakerphoneOn(next);
    setSpeaker(next);
  };
  const toggleCamera = () => {
    const stream = local.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach(track => { track.enabled = !next; });
    setCameraOff(next);
  };
  const switchCamera = async () => {
    const track = local.current?.getVideoTracks()[0];
    if (!track || cameraBusy.current) return;
    const token = generation.current;
    cameraBusy.current = true;
    try {
      await track.applyConstraints({ facingMode: frontCamera ? 'environment' : 'user' });
      if (generation.current === token) setFrontCamera(previous => !previous);
    } catch {
      if (generation.current === token) Alert.alert('Kamera', 'Kamera değiştirilemedi.');
    } finally {
      if (generation.current === token) cameraBusy.current = false;
    }
  };

  const value = useMemo<NativeCallApi>(() => ({ supported, phase: call.phase, startCall }), [call.phase, startCall, supported]);
  const RTCView = rtc?.RTCView;
  const inCall = call.phase === 'active' || call.phase === 'connecting';
  const status = call.phase === 'incoming' ? 'Gelen arama' : call.phase === 'outgoing' ? 'Aranıyor…' : call.phase === 'connecting' ? 'Bağlanıyor…' : duration(call.startedAt);
  return (
    <NativeCallContext.Provider value={value}>
      {children}
      <Modal visible={call.phase !== 'idle'} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => finish()}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.header}>
            <Text style={styles.name}>{call.peerName}</Text>
            <Text style={styles.status}>{call.mode === 'video' ? 'Görüntülü arama' : 'Sesli arama'} · {status}</Text>
          </View>
          <View style={styles.media}>
            {call.mode === 'video' && remoteStream && RTCView ? <RTCView style={styles.remoteVideo} streamURL={remoteStream.toURL()} objectFit="contain" /> : <Ionicons name="person-circle-outline" size={132} color="#94a3b8" />}
            {call.mode === 'video' && localStream && !cameraOff && RTCView ? <RTCView style={styles.localVideo} streamURL={localStream.toURL()} mirror={frontCamera} objectFit="cover" zOrder={1} /> : null}
            {call.phase === 'connecting' ? <ActivityIndicator color="#fff" size="large" style={styles.connecting} /> : null}
          </View>
          <View style={styles.controls}>
            {inCall ? <>
              <CallControl label={muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'} icon={muted ? 'mic-off' : 'mic'} selected={muted} onPress={toggleMute} />
              <CallControl label={speaker ? 'Ahizeye al' : 'Hoparlöre al'} icon={speaker ? 'volume-high' : 'ear'} selected={speaker} onPress={toggleSpeaker} />
              {call.mode === 'video' ? <>
                <CallControl label={cameraOff ? 'Kamerayı aç' : 'Kamerayı kapat'} icon={cameraOff ? 'videocam-off' : 'videocam'} selected={cameraOff} onPress={toggleCamera} />
                <CallControl label="Kamerayı çevir" icon="camera-reverse" onPress={() => { void switchCamera(); }} />
              </> : null}
            </> : null}
          </View>
          <View style={styles.actions}>
            {call.phase === 'incoming' ? <CallControl label={accepting ? 'Kabul ediliyor…' : 'Kabul et'} icon="call" color="#15803d" disabled={accepting} onPress={() => { void acceptCall(); }} /> : null}
            <CallControl label={call.phase === 'incoming' ? 'Reddet' : 'Aramayı kapat'} icon="call" color="#dc2626" onPress={() => finish()} />
          </View>
        </SafeAreaView>
      </Modal>
    </NativeCallContext.Provider>
  );
}

function CallControl({ label, icon, selected, color, disabled, onPress }: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  selected?: boolean;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={styles.control}>
    <View style={[styles.controlIcon, { backgroundColor: color ?? (selected ? '#475569' : '#1e293b'), opacity: disabled ? 0.5 : 1 }]}><Ionicons name={icon} color="#fff" size={25} /></View>
    <Text style={styles.controlLabel}>{label}</Text>
  </Pressable>;
}

export function useNativeCall(): NativeCallApi { return useContext(NativeCallContext); }
export type { CallMediaMode } from './types';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 24, alignItems: 'center' },
  name: { color: '#fff', fontSize: 24, fontWeight: '600', textAlign: 'center' },
  status: { color: '#cbd5e1', fontSize: 15, marginTop: 8 },
  media: { flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },
  remoteVideo: { width: '100%', height: '100%' },
  localVideo: { position: 'absolute', top: 8, right: 8, width: 110, height: 150, borderRadius: 12 },
  connecting: { position: 'absolute', bottom: 20 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 20 },
  actions: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 24 },
  control: { alignItems: 'center', width: 88, paddingHorizontal: 4, paddingVertical: 8 },
  controlIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: '#e2e8f0', fontSize: 11, marginTop: 8, textAlign: 'center' },
});
