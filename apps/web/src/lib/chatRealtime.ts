import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN, getAccessToken } from "./apiClient";

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
    sharedSocket = io(API_ORIGIN, { auth: { token }, transports: ["websocket"] });
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
    else s.once("connect", join);
    return () => { s.emit("leave", { conversationId: id }); };
  }, [params.conversationId]);
}
