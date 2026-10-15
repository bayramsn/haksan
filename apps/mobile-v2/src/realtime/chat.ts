import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { io, type Socket } from 'socket.io-client';
import { accessTokenSnapshot, subscribeAccessToken } from '@/src/api/client';
import { apiBaseUrl } from '@/src/api/config';
import { chatKeys } from '@/src/api/chat.keys';
import { queryClient } from '@/src/query/client';

type RealtimeState = 'disabled' | 'connecting' | 'connected' | 'disconnected';
type ConversationEvent = { conversationId: string };

const enabled = process.env.EXPO_PUBLIC_CHAT_REALTIME !== 'false';
let socket: Socket | null = null;
let state: RealtimeState = enabled ? 'disconnected' : 'disabled';
const stateListeners = new Set<() => void>();

function setState(next: RealtimeState): void {
  if (state === next) return;
  state = next;
  for (const listener of stateListeners) listener();
}

function subscribeState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function socketOrigin(): string {
  return new URL(apiBaseUrl()).origin;
}

function isConversationEvent(value: unknown): value is ConversationEvent {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).conversationId === 'string' &&
      (value as Record<string, unknown>).conversationId
  );
}

function getSocket(): Socket | null {
  if (!enabled || !accessTokenSnapshot()) return null;
  if (socket) return socket;

  socket = io(socketOrigin(), {
    autoConnect: false,
    auth: (callback) => callback({ token: accessTokenSnapshot() ?? '' }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 750,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.4,
    timeout: 10_000,
  });
  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', () => setState('disconnected'));
  socket.on('connect_error', () => setState('disconnected'));
  return socket;
}

function connect(): Socket | null {
  const current = getSocket();
  if (!current) return null;
  if (!current.connected && !current.active) {
    setState('connecting');
    current.connect();
  }
  return current;
}

export function disconnectChatSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setState(enabled ? 'disconnected' : 'disabled');
}

export function useChatRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribeState, () => state === 'connected', () => false);
}

/**
 * Oturum boyunca tek Socket.IO bağlantısını yönetir. Token yenilenince yeni JWT
 * ile yeniden el sıkışır; ağ yokken ve uygulama arka plandayken bağlantıyı kapatır.
 * Polling, `useChatRealtimeConnected` false olduğunda sorgu hook'larında fallback'tir.
 */
export function useChatRealtimeLifecycle(authenticated: boolean): void {
  useEffect(() => {
    if (!authenticated || !enabled) {
      disconnectChatSocket();
      return;
    }

    let foreground = AppState.currentState === 'active';
    let online = true;
    const current = connect();
    if (!current) return;

    const refreshConversations = (event: unknown) => {
      if (!isConversationEvent(event)) return;
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };
    current.on('conversation:updated', refreshConversations);

    const reconcile = () => {
      if (!accessTokenSnapshot() || !foreground || !online) {
        current.disconnect();
        return;
      }
      if (!current.connected && !current.active) {
        setState('connecting');
        current.connect();
      }
    };

    const appState = AppState.addEventListener('change', (next) => {
      foreground = next === 'active';
      reconcile();
    });
    const netInfo = NetInfo.addEventListener((next) => {
      online = Boolean(next.isConnected && next.isInternetReachable !== false);
      reconcile();
    });
    const token = subscribeAccessToken((next) => {
      if (!next) {
        current.disconnect();
        return;
      }
      current.auth = { token: next };
      if (current.connected) current.disconnect();
      reconcile();
    });

    return () => {
      current.off('conversation:updated', refreshConversations);
      appState.remove();
      netInfo();
      token();
      disconnectChatSocket();
    };
  }, [authenticated]);
}

/** Açık sohbet odasına üyelik kontrollü girer ve mesaj olaylarında cache'i tazeler. */
export function useConversationRealtime(conversationId: string): void {
  useEffect(() => {
    if (!enabled || !conversationId) return;
    const current = connect();
    if (!current) return;

    const refreshMessages = (event: unknown) => {
      if (!isConversationEvent(event) || event.conversationId !== conversationId) return;
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };
    const join = () => {
      current.timeout(5_000).emit(
        'join',
        { conversationId },
        (_error: Error | null, response?: { ok?: boolean }) => {
          if (response?.ok === false) setState('disconnected');
        }
      );
    };

    current.on('message:new', refreshMessages);
    current.on('message:updated', refreshMessages);
    current.on('connect', join);
    if (current.connected) join();

    return () => {
      current.off('message:new', refreshMessages);
      current.off('message:updated', refreshMessages);
      current.off('connect', join);
      if (current.connected) current.emit('leave', { conversationId });
    };
  }, [conversationId]);
}
