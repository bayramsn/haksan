import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN, getAccessToken } from "./apiClient";

/**
 * Sohbet gerçek-zaman istemcisi. VARSAYILAN KAPALI — yalnızca VITE_CHAT_REALTIME=true
 * ile derlendiğinde bağlanır. Kapalıyken hook tamamen no-op'tur ve ChatPage'in
 * polling'i devrede kalır. VDS'te (kalıcı sunucu) bayrak açılınca anlık iletim eklenir.
 */
const ENABLED = import.meta.env.VITE_CHAT_REALTIME === "true";

export function chatRealtimeEnabled(): boolean {
  return ENABLED;
}

export function useChatRealtime(params: {
  conversationId: string | null;
  onMessageEvent: () => void;
  onConversationEvent: () => void;
}): void {
  const cbRef = useRef(params);
  cbRef.current = params;
  const socketRef = useRef<Socket | null>(null);

  // Tek bağlantı (mount'ta). El sıkışmada access token gönderilir.
  useEffect(() => {
    if (!ENABLED) return;
    const socket = io(API_ORIGIN, { auth: { token: getAccessToken() }, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("message:new", () => cbRef.current.onMessageEvent());
    socket.on("message:updated", () => cbRef.current.onMessageEvent());
    socket.on("conversation:updated", () => cbRef.current.onConversationEvent());
    return () => { socket.disconnect(); socketRef.current = null; };
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
