import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getChatCallSocket, useChatRealtimeConnected } from './chat';

type Typist = { name: string; expiresAt: number };

/** Uses the conversation membership managed by useConversationRealtime. */
export function useTyping(conversationId: string, userId: string | undefined) {
  const connected = useChatRealtimeConnected();
  const [typists, setTypists] = useState<Record<string, Typist>>({});
  const lastSent = useRef(0);
  const sending = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<ReturnType<typeof getChatCallSocket>>(null);
  const stop = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (sending.current && socketRef.current?.connected) {
      socketRef.current.emit('typing:set', { conversationId, isTyping: false });
    }
    sending.current = false;
    lastSent.current = 0;
  }, [conversationId]);
  const update = useCallback((text: string) => {
    if (!text.trim()) { stop(); return; }
    if (AppState.currentState !== 'active' || !socketRef.current?.connected || !userId) return;
    const now = Date.now();
    if (!sending.current || now - lastSent.current >= 2000) {
      socketRef.current.emit('typing:set', { conversationId, isTyping: true });
      sending.current = true;
      lastSent.current = now;
    }
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(stop, 3000);
  }, [conversationId, userId, stop]);

  useEffect(() => {
    setTypists({});
    if (!userId || !connected) { stop(); return; }
    const socket = getChatCallSocket();
    socketRef.current = socket;
    const receive = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const event = value as Record<string, unknown>;
      if (event.conversationId !== conversationId || typeof event.userId !== 'string' || event.userId === userId ||
          typeof event.fullName !== 'string' || typeof event.isTyping !== 'boolean' ||
          typeof event.expiresAt !== 'number' || !Number.isFinite(event.expiresAt)) return;
      const senderId = event.userId;
      const name = event.fullName.slice(0, 150);
      const expiresAt = Math.min(Date.now() + 5000, event.expiresAt);
      setTypists((previous) => {
        const next = { ...previous };
        if (event.isTyping && expiresAt > Date.now()) next[senderId] = { name, expiresAt };
        else delete next[senderId];
        return next;
      });
    };
    socket?.on('typing:update', receive);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { stop(); setTypists({}); }
    });
    return () => {
      stop();
      socket?.off('typing:update', receive);
      socketRef.current = null;
      appState.remove();
    };
  }, [conversationId, userId, connected, stop]);

  useEffect(() => {
    const expirations = Object.values(typists).map((entry) => entry.expiresAt);
    if (!expirations.length) return;
    const timer = setTimeout(() => setTypists((previous) => Object.fromEntries(
      Object.entries(previous).filter(([, entry]) => entry.expiresAt > Date.now())
    )), Math.max(0, Math.min(...expirations) - Date.now()));
    return () => clearTimeout(timer);
  }, [typists]);
  return { names: Object.values(typists).map((entry) => entry.name), update, stop };
}
