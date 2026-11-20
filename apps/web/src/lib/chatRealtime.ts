import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN, getAccessToken, refreshSession } from "./apiClient";

/**
 * Sohbet gerçek-zaman istemcisi. VARSAYILAN AÇIK — VITE_CHAT_REALTIME=false ile
 * derlenirse kapanır. Soket bağlanamazsa ChatPage'in polling'i zaten devrede
 * kalır; bayrak yalnız soket denemesini tamamen kapatmak içindir.
 */
const ENABLED = import.meta.env.VITE_CHAT_REALTIME !== "false";

export function chatRealtimeEnabled(): boolean {
  return ENABLED;
}

/**
 * Tek paylaşılan soket: hem sohbet olayları hem sesli arama sinyalleşmesi
 * bu bağlantıyı kullanır. ChatPage kapanınca bağlantı KAPANMAZ — gelen
 * aramalar uygulamanın her yerinde çalabilsin diye oturum boyunca yaşar.
 * Oturum kapanışında `disconnectChatSocket()` çağrılır.
 */
let sharedSocket: Socket | null = null;

export function getChatSocket(): Socket | null {
  if (!ENABLED) return null;
  const token = getAccessToken();
  if (!token) return null;
  if (!sharedSocket) {
    const socket = io(API_ORIGIN, {
      auth: (send) => send({ token: getAccessToken() ?? "" }),
      transports: ["websocket"],
    });
    sharedSocket = socket;
    socket.on("connect_error", (error: Error & { data?: { code?: string } }) => {
      if (error.data?.code !== "CHAT_ACCESS_EXPIRED" || sharedSocket !== socket || !getAccessToken()) return;
      void refreshSession().then((renewedToken) => {
        if (renewedToken && sharedSocket === socket && !socket.connected && !socket.active) socket.connect();
      });
    });
  }
  return sharedSocket;
}

export function disconnectChatSocket(): void {
  sharedSocket?.disconnect();
  sharedSocket = null;
}

export function useChatRealtime(params: {
  conversationId: string | null;
  onMessageEvent: () => void;
  onConversationEvent: () => void;
}): void {
  const cbRef = useRef(params);
  cbRef.current = params;
  const socketRef = useRef<Socket | null>(null);

  // Paylaşılan sokete abone ol; unmount'ta yalnız kendi dinleyicilerini kaldır.
  useEffect(() => {
    if (!ENABLED) return;
    const socket = getChatSocket();
    if (!socket) return;
    socketRef.current = socket;
    const onMessage = () => cbRef.current.onMessageEvent();
    const onConversation = () => cbRef.current.onConversationEvent();
    socket.on("message:new", onMessage);
    socket.on("message:updated", onMessage);
    socket.on("conversation:updated", onConversation);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("message:updated", onMessage);
      socket.off("conversation:updated", onConversation);
      socketRef.current = null;
    };
  }, []);

  // Açık konuşmanın odasına gir/çık.
  useEffect(() => {
    if (!ENABLED) return;
    const s = socketRef.current;
    const id = params.conversationId;
    if (!s || !id) return;
    const join = () => s.emit("join", { conversationId: id });
    if (s.connected) join();
    s.on("connect", join);
    return () => { s.off("connect", join); s.emit("leave", { conversationId: id }); };
  }, [params.conversationId]);
}

/** Typing is transient: reconnect, conversation changes and unmount clear it. */
export function useChatTyping(conversationId: string | null, meId: string) {
  const [typers, setTypers] = useState<Record<string, { name: string; until: number }>>({});
  const lastSent = useRef(0);
  const sendTyping = useCallback((isTyping: boolean) => {
    const socket = getChatSocket();
    if (!conversationId || !socket?.connected) return;
    const now = Date.now();
    if (isTyping && now - lastSent.current < 2000) return;
    lastSent.current = isTyping ? now : 0;
    socket.emit("typing:set", { conversationId, isTyping });
  }, [conversationId]);
  useEffect(() => {
    setTypers({});
    const socket = getChatSocket();
    if (!socket || !conversationId) return;
    const update = (event: { conversationId: string; userId: string; fullName: string; isTyping: boolean; expiresAt: number }) => {
      if (event.conversationId !== conversationId || event.userId === meId) return;
      setTypers((current) => {
        const next = { ...current };
        if (event.isTyping) next[event.userId] = { name: event.fullName, until: Date.now() + 5000 };
        else delete next[event.userId];
        return next;
      });
    };
    const clear = () => setTypers({});
    socket.on("typing:update", update);
    socket.on("disconnect", clear);
    const timer = setInterval(() => setTypers((current) => {
      const entries = Object.entries(current).filter(([, value]) => value.until > Date.now());
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    }), 1000);
    return () => {
      clearInterval(timer);
      socket.off("typing:update", update);
      socket.off("disconnect", clear);
      socket.emit("typing:set", { conversationId, isTyping: false });
      lastSent.current = 0;
    };
  }, [conversationId, meId]);
  return { typingNames: Object.values(typers).map((t) => t.name), sendTyping };
}
