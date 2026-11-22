import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthProvider';
import { requestContextKey } from '@/src/api/client';
import { chatExt } from '@/src/api/crm-general.api';
import { getChatCallMedia } from '@/src/native/chat-call';
import { stopChatAudio } from '@/src/native/chat-audio';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CallMediaView } from '@/src/ui/chat/CallMediaView';
import { createCallEngine, type CallMode, type CallState } from './call-engine';
import { getChatSocket, useChatRealtimeConnected } from './chat';

const IDLE: CallState = { phase: 'idle', muted: false, cameraOff: false };
const Context = createContext({ supported: false, phase: 'idle' as CallState['phase'], start: async (_id: string, _mode: CallMode) => {} });
export const useChatCall = () => useContext(Context);

export function ChatCallProvider({ children }: { children: ReactNode }) {
  const { user, scope } = useAuth();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const connected = useChatRealtimeConnected();
  const [supported, setSupported] = useState(false);
  const [rawCall, setCall] = useState<CallState>(IDLE);
  const [callContext, setCallContext] = useState('');
  const [tick, setTick] = useState(0);
  const engine = useRef<ReturnType<typeof createCallEngine> | null>(null);
  const context = requestContextKey();
  const call = callContext === context ? rawCall : IDLE;
  useEffect(() => {
    setCall(IDLE); setCallContext(context); setSupported(false);
    if (!user || !connected) { setCall(IDLE); return; }
    let alive = true;
    const socket = getChatSocket();
    if (!socket) return;
    void getChatCallMedia().then(media => {
      if (!alive) return;
      setSupported(Boolean(media));
      if (!media) return;
      engine.current = createCallEngine({
        socket,
        media,
        getContextKey: requestContextKey,
        getConversation: async id => {
          const detail = await chatExt.conversation(id);
          if (detail.type !== 'dm' || detail.members.length !== 2 || !detail.members.some(member => member.userId === user.id)) return null;
          const peer = detail.members.find(member => member.userId !== user.id);
          return peer ? { id: detail.id, peerUserId: peer.userId, peerName: peer.fullName } : null;
        },
        getIceConfig: async () => {
          const config = await chatExt.webrtcConfig();
          return { iceServers: config.iceServers };
        },
        onChange: next => { if (alive) setCall(next); },
        notify: message => toast.error(message),
      });
    }).catch(() => { if (alive) { setSupported(false); toast.error('Arama modülü açılamadı. Uygulamayı güncelleyin.'); } });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' || (state === 'inactive' && engine.current?.getState().localStream)) engine.current?.hangup();
    });
    return () => { alive = false; listener.remove(); engine.current?.dispose(); engine.current = null; };
  }, [user?.id, connected, context, scope.divisionId, scope.departmentId]);

  useEffect(() => {
    if (call.phase !== 'active') return;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [call.phase]);
  const elapsed = Math.max(0, Math.floor((Date.now() - (call.startedAt ?? Date.now())) / 1000));
  void tick;
  const start = async (id: string, mode: CallMode) => {
    if (!engine.current || !supported) return toast.error(connected ? 'Arama için güncel uygulama paketini kullanın.' : 'Arama için sohbet bağlantısının kurulmasını bekleyin.');
    const current = engine.current, key = requestContextKey();
    await stopChatAudio();
    if (current !== engine.current || key !== requestContextKey()) return;
    await current.start(id, mode);
  };
  const accept = async () => {
    const current = engine.current, key = requestContextKey();
    await stopChatAudio();
    if (current && current === engine.current && key === requestContextKey()) await current.accept();
  };
  return <Context.Provider value={{ supported, phase: call.phase, start }}>
    {children}
    <Modal visible={call.phase !== 'idle'} animationType="slide" onRequestClose={() => engine.current?.hangup()}>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="w-full max-w-3xl flex-1 self-center gap-5 p-5">
          <Text accessibilityRole="header" className="text-center font-display text-2xl text-foreground">{call.peerName || 'Sohbet araması'}</Text>
          <Text accessibilityLiveRegion="polite" className="text-center font-inter text-sm text-muted-foreground">{call.phase === 'incoming' ? `${call.mode === 'video' ? 'Görüntülü' : 'Sesli'} arama geliyor` : call.phase === 'active' && !call.connected ? 'Bağlanıyor…' : call.phase === 'active' ? `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}` : call.phase === 'preparing' ? 'Arama hazırlanıyor…' : 'Yanıt bekleniyor…'}</Text>
          <View className={`flex-1 gap-3 ${landscape ? 'flex-row' : ''}`}>
            {call.remoteStream && (call.mode === 'video' || Platform.OS === 'web') ? <CallMediaView stream={call.remoteStream} /> : null}
            {call.localStream && call.mode === 'video' && !call.cameraOff ? <CallMediaView stream={call.localStream} local /> : null}
          </View>
          {call.phase === 'incoming' ? <Button label="Aramayı kabul et" trailingIcon="call-outline" onPress={() => void accept().catch(() => toast.error('Arama kabul edilemedi.'))} /> : null}
          {call.phase === 'active' || call.phase === 'outgoing' ? <View className="flex-row flex-wrap justify-center gap-3">
            <Button variant="ghost" label={call.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'} onPress={() => engine.current?.toggleMute()} />
            {call.mode === 'video' ? <Button variant="ghost" label={call.cameraOff ? 'Kamerayı aç' : 'Kamerayı kapat'} onPress={() => engine.current?.toggleCamera()} /> : null}
          </View> : null}
          <Button variant="destructive" label={call.phase === 'incoming' ? 'Reddet' : 'Aramayı bitir'} onPress={() => engine.current?.hangup()} />
          <Text className="text-center font-inter text-xs text-muted-foreground">Arama uygulama açıkken sürer. Arka plana geçtiğinizde sonlandırılır.</Text>
        </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </Context.Provider>;
}
