import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { ScrollArea } from "../../ui/scroll-area";
import { Badge } from "../../ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "../../ui/dialog";
import { useAuth } from "../../../../lib/auth";
import {
  chatService, fileService,
  type ChatConversationSummary, type ChatConversationDetail, type ChatMessageDTO, type ChatDirectoryUser, type ChatRefCard,
} from "../../../../lib/services";
import type { SignedUploadUrlInput, ChatRefType } from "@haksan/shared";
import { useChatRealtime } from "../../../../lib/chatRealtime";
import { toast } from "sonner";
import { cn } from "../../ui/utils";
import {
  MessageCircle, Send, Paperclip, Search, Plus, Trash2, FileText, X, Loader2, Users,
  Smile, CornerUpLeft, Pencil, Check, CheckCheck, Mic, Square, FileText as FileIcon, Building2, Briefcase, LifeBuoy,
} from "lucide-react";
import { NewGroupDialog, GroupSettingsDialog } from "./GroupDialogs";
import { ShareRecordDialog } from "./ShareRecordDialog";

const ALLOWED_EXT = ["pdf", "docx", "xlsx", "png", "jpg", "jpeg", "webp", "webm", "mp3", "ogg", "m4a", "wav"];
const ACCEPT = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,image/*";
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "✅", "🙏"];
const REF_ICON: Record<string, any> = { company: Building2, quote: FileText, opportunity: Briefcase, service_ticket: LifeBuoy };

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
function errMsg(e: unknown): string {
  return (e as { message?: string })?.message ?? "İşlem başarısız";
}
function convDisplay(c: { type: string; title: string | null; members: { userId: string; fullName: string }[] }, meId: string): string {
  if (c.type === "group") return c.title || "Grup";
  return c.members.find((m) => m.userId !== meId)?.fullName || "Sohbet";
}

type Pending = { fileId: string; filename: string; isImage: boolean; isAudio: boolean };

export function ChatPage({ onOpenRecord }: { onOpenRecord?: (card: ChatRefCard) => void }) {
  const { user, hasRole } = useAuth();
  const meId = user?.id ?? "";
  const isSuper = hasRole("super_admin");

  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [directory, setDirectory] = useState<ChatDirectoryUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; preview: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; original: string } | null>(null);
  const [recording, setRecording] = useState(false);

  const messageScrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadConversations = useCallback(() => {
    chatService.conversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    chatService.directory().then(setDirectory).catch(() => {});
  }, []);
  useEffect(() => {
    loadConversations();
    const h = setInterval(() => { if (!document.hidden) loadConversations(); }, 8000);
    return () => clearInterval(h);
  }, [loadConversations]);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const res = await chatService.messages(id, { limit: 50 });
      if (selectedIdRef.current === id) setMessages(res.messages);
    } catch { /* polling tekrar dener */ }
  }, []);

  const reloadDetail = useCallback(() => {
    const id = selectedIdRef.current;
    if (id) chatService.conversation(id).then(setDetail).catch(() => {});
    loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    setMessages([]); setDetail(null); setText(""); setPending([]); setReplyTo(null); setEditing(null);
    try {
      const d = await chatService.conversation(id);
      if (selectedIdRef.current === id) setDetail(d);
    } catch (e) { toast.error(errMsg(e)); return; }
    await loadMessages(id);
    chatService.markRead(id).then(loadConversations).catch(() => {});
  }, [loadMessages, loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    const h = setInterval(() => {
      if (document.hidden) return;
      chatService.messages(selectedId, { limit: 50 }).then((res) => {
        if (selectedIdRef.current !== selectedId) return;
        setMessages(res.messages);
        chatService.markRead(selectedId).then(loadConversations).catch(() => {});
      }).catch(() => {});
      // Karşı tarafın "görüldü" bilgisini tazelemek için detayı da hafifçe yenile.
      chatService.conversation(selectedId).then((d) => { if (selectedIdRef.current === selectedId) setDetail(d); }).catch(() => {});
    }, 3000);
    return () => clearInterval(h);
  }, [selectedId, loadConversations]);

  // Gerçek-zaman (VITE_CHAT_REALTIME=true ise): olay gelince anında yenile.
  // Kapalıyken no-op — yukarıdaki polling devrede kalır.
  useChatRealtime({
    conversationId: selectedId,
    onMessageEvent: () => { const id = selectedIdRef.current; if (id) loadMessages(id); },
    onConversationEvent: () => loadConversations(),
  });

  useEffect(() => {
    const viewport = messageScrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages.length, selectedId]);

  const canPost = useMemo(() => {
    if (!detail) return false;
    if (detail.type === "dm" || !detail.onlyAdminsCanPost) return true;
    return detail.myRole === "admin" || isSuper;
  }, [detail, isSuper]);

  const isManager = isSuper || detail?.myRole === "admin";
  // DM'de karşı tarafın okuduğu an — "görüldü" (✓✓) hesabı için.
  const otherReadAt = useMemo(() => {
    if (!detail || detail.type !== "dm") return null;
    return detail.members.find((m) => m.userId !== meId)?.lastReadAt ?? null;
  }, [detail, meId]);

  const uploadOne = async (file: File, asAudio = false): Promise<void> => {
    const id = selectedIdRef.current;
    if (!id) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) { toast.error(`Desteklenmeyen tür: .${ext}`); return; }
    const up = await fileService.signedUpload({
      bucket: "erp-service-documents",
      entityType: "chat_conversation",
      entityId: id,
      filename: file.name,
      mimeType: file.type as SignedUploadUrlInput["mimeType"],
      extension: ext as SignedUploadUrlInput["extension"],
      sizeBytes: file.size,
    });
    await fileService.uploadBinary(up, file, file.type);
    setPending((p) => [...p, { fileId: up.fileId, filename: file.name, isImage: file.type.startsWith("image/"), isAudio: asAudio || file.type.startsWith("audio/") }]);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try { await uploadOne(file); } catch { toast.error(`Yüklenemedi: ${file.name}`); }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Sesli mesaj kaydı ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        try { await uploadOne(file, true); } catch { toast.error("Sesli mesaj yüklenemedi"); }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Mikrofona erişilemedi");
    }
  };
  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const send = async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    if (editing) {
      const body = text.trim();
      if (!body) return;
      try {
        await chatService.editMessage(editing.id, body);
        setEditing(null); setText("");
        await loadMessages(id);
      } catch (e) { toast.error(errMsg(e)); }
      return;
    }
    if (!text.trim() && pending.length === 0) return;
    setSending(true);
    try {
      await chatService.sendMessage(id, {
        body: text.trim() || undefined,
        attachmentFileIds: pending.length ? pending.map((p) => p.fileId) : undefined,
        replyToId: replyTo?.id,
      });
      setText(""); setPending([]); setReplyTo(null);
      await loadMessages(id);
      loadConversations();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSending(false); }
  };

  const shareRecord = async (refType: ChatRefType, refId: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    try {
      await chatService.sendMessage(id, { refType, refId });
      await loadMessages(id);
      loadConversations();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const react = async (messageId: string, emoji: string) => {
    try {
      await chatService.toggleReaction(messageId, emoji);
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const delMsg = async (id: string) => {
    try {
      await chatService.deleteMessage(id);
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const startEdit = (m: ChatMessageDTO) => {
    setEditing({ id: m.id, original: m.body ?? "" });
    setText(m.body ?? "");
    setReplyTo(null);
  };
  const cancelEdit = () => { setEditing(null); setText(""); };

  const startDm = async (userId: string) => {
    try {
      const d = await chatService.createDm(userId);
      setNewOpen(false);
      loadConversations();
      await openConversation(d.id);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const filtered = conversations.filter((c) => convDisplay(c, meId).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[460px] overflow-hidden rounded-xl border border-border/60 bg-card">
      {/* Sol pano */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center gap-2 border-b border-border/60 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara…" className="pl-8" />
          </div>
        </div>
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5"><Plus className="size-4" /> Yeni Sohbet</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Yeni Sohbet</DialogTitle>
                <DialogDescription>Bir çalışan seçerek özel mesaj başlatın.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-72 rounded-md border border-border/60">
                <div className="p-1.5 space-y-0.5">
                  {directory.map((u) => (
                    <button
                      key={u.id} type="button" onClick={() => startDm(u.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">{initials(u.fullName)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{u.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </button>
                  ))}
                  {directory.length === 0 && <div className="px-2 py-6 text-center text-sm text-muted-foreground">Başka çalışan yok</div>}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
          {isSuper && (
            <NewGroupDialog directory={directory} onCreated={(d) => { loadConversations(); openConversation(d.id); }} />
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-1.5">
            {filtered.map((c) => {
              const name = convDisplay(c, meId);
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id} onClick={() => openConversation(c.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors", active ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted")}
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium", c.type === "group" ? "bg-primary/15 text-primary" : "bg-muted")}>
                    {c.type === "group" ? <Users className="size-4" /> : initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {c.lastMessage && <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.lastMessage.createdAt)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.lastMessage?.preview ?? "Henüz mesaj yok"}</span>
                      {c.unreadCount > 0 && <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-brand-red px-1.5 text-[10px] text-white hover:bg-brand-red">{c.unreadCount}</Badge>}
                    </span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted-foreground">Sohbet yok. "Yeni Sohbet" ile başlayın.</div>}
          </div>
        </ScrollArea>
      </div>

      {/* Sağ pano */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!detail ? (
          <div className="grid flex-1 place-items-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="mx-auto mb-3 size-10 opacity-40" />
              <p className="text-sm">Bir sohbet seçin veya yeni bir sohbet başlatın.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium", detail.type === "group" ? "bg-primary/15 text-primary" : "bg-muted")}>
                {detail.type === "group" ? <Users className="size-4" /> : initials(convDisplay(detail, meId))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{convDisplay(detail, meId)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {detail.type === "group"
                    ? `${detail.members.length} üye${detail.onlyAdminsCanPost ? " · yalnız yöneticiler yazabilir" : ""}`
                    : detail.members.find((m) => m.userId !== meId)?.email}
                </div>
              </div>
              {detail.type === "group" && (
                <GroupSettingsDialog detail={detail} directory={directory} isManager={!!isManager} currentUserId={meId} onChanged={reloadDetail} />
              )}
            </div>

            <ScrollArea ref={messageScrollAreaRef} className="min-h-0 flex-1">
              <div className="flex flex-col gap-1.5 p-4">
                {messages.map((m) => (
                  <MessageItem
                    key={m.id} m={m} mine={m.senderId === meId} isGroup={detail.type === "group"}
                    canModerate={!!isManager} otherReadAt={otherReadAt}
                    onReply={() => { setReplyTo({ id: m.id, senderName: m.senderName, preview: m.body || "Ek" }); setEditing(null); }}
                    onReact={(emoji) => react(m.id, emoji)}
                    onEdit={() => startEdit(m)} onDelete={() => delMsg(m.id)}
                    onOpenRecord={onOpenRecord}
                  />
                ))}
                {messages.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">Henüz mesaj yok. İlk mesajı gönderin.</div>}
              </div>
            </ScrollArea>

            {/* Yazma alanı */}
            {canPost ? (
              <div className="border-t border-border/60 p-3">
                {replyTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1.5 text-xs">
                    <CornerUpLeft className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate"><b>{replyTo.senderName}</b>: {replyTo.preview}</span>
                    <button onClick={() => setReplyTo(null)}><X className="size-3.5" /></button>
                  </div>
                )}
                {editing && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-warning bg-warning-soft px-2 py-1.5 text-xs">
                    <Pencil className="size-3.5 shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 truncate">Mesaj düzenleniyor</span>
                    <button onClick={cancelEdit}><X className="size-3.5" /></button>
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pending.map((p) => (
                      <span key={p.fileId} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                        {p.isAudio ? <Mic className="size-3.5" /> : <FileText className="size-3.5" />}
                        <span className="max-w-[140px] truncate">{p.isAudio ? "Sesli mesaj" : p.filename}</span>
                        <button onClick={() => setPending((arr) => arr.filter((x) => x.fileId !== p.fileId))}><X className="size-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-1.5">
                  <input ref={fileInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
                  {!editing && (
                    <>
                      <Button variant="ghost" size="icon" title="Dosya/görsel ekle" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-5" /></Button>
                      <ShareRecordDialog onShare={shareRecord} />
                      {recording ? (
                        <Button variant="destructive" size="icon" title="Kaydı bitir" onClick={stopRecording}><Square className="size-5" /></Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Sesli mesaj" onClick={startRecording}><Mic className="size-5" /></Button>
                      )}
                    </>
                  )}
                  <Textarea
                    value={text} onChange={(e) => setText(e.target.value)} rows={1}
                    placeholder={recording ? "Kaydediliyor… bitince gönderebilirsiniz" : editing ? "Mesajı düzenleyin…" : "Mesaj yazın…"}
                    className="max-h-32 min-h-10 flex-1 resize-none"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  />
                  <Button onClick={send} disabled={sending || (!editing && !text.trim() && pending.length === 0) || (!!editing && !text.trim())} size="icon" title={editing ? "Kaydet" : "Gönder"}>
                    {sending ? <Loader2 className="size-5 animate-spin" /> : editing ? <Check className="size-5" /> : <Send className="size-5" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-border/60 bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
                Bu grupta yalnızca yöneticiler mesaj gönderebilir.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MessageItem({
  m, mine, isGroup, canModerate, otherReadAt, onReply, onReact, onEdit, onDelete, onOpenRecord,
}: {
  m: ChatMessageDTO; mine: boolean; isGroup: boolean; canModerate: boolean; otherReadAt: string | null;
  onReply: () => void; onReact: (emoji: string) => void; onEdit: () => void; onDelete: () => void;
  onOpenRecord?: (card: ChatRefCard) => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);

  if (m.kind === "system") {
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{m.body}</span>
      </div>
    );
  }

  const seen = mine && !isGroup && otherReadAt != null && new Date(otherReadAt).getTime() >= new Date(m.createdAt).getTime();

  return (
    <div className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
      <div className={cn("relative max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
        {isGroup && !mine && <div className="mb-0.5 text-[11px] font-semibold opacity-80">{m.senderName}</div>}

        {m.replyTo && (
          <div className={cn("mb-1 rounded-md border-l-2 px-2 py-1 text-[11px]", mine ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary bg-background/60")}>
            <b>{m.replyTo.senderName}</b>: <span className="opacity-80">{m.replyTo.preview}</span>
          </div>
        )}

        {m.refCard && <RefCardView card={m.refCard} mine={mine} onOpen={onOpenRecord} />}

        {m.attachments.length > 0 && (
          <div className="mb-1 space-y-1.5">
            {m.attachments.map((a) => a.isImage ? (
              <a key={a.fileId} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.filename} className="max-h-60 rounded-lg object-cover" /></a>
            ) : a.mimeType.startsWith("audio/") ? (
              <audio key={a.fileId} controls src={a.url} className="h-9 w-56 max-w-full" />
            ) : (
              <a key={a.fileId} href={a.url} target="_blank" rel="noreferrer" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs", mine ? "bg-primary-foreground/15" : "bg-background")}>
                <FileIcon className="size-4 shrink-0" /><span className="truncate">{a.filename}</span>
              </a>
            ))}
          </div>
        )}

        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}

        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {m.editedAt && <span>düzenlendi</span>}
          <span>{fmtTime(m.createdAt)}</span>
          {mine && !isGroup && (seen ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />)}
        </div>
      </div>

      {/* Tepkiler */}
      {m.reactions.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {m.reactions.map((r) => (
            <button
              key={r.emoji} onClick={() => onReact(r.emoji)}
              className={cn("flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px]", r.mine ? "border-primary bg-primary/10" : "border-border bg-background")}
            >
              <span>{r.emoji}</span><span className="text-muted-foreground">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hover aksiyonları */}
      <div className={cn("mt-0.5 hidden items-center gap-1 group-hover:flex", mine ? "flex-row-reverse" : "")}>
        <div className="relative">
          <button className="text-muted-foreground hover:text-foreground" title="Tepki ver" onClick={() => setShowEmoji((s) => !s)}><Smile className="size-3.5" /></button>
          {showEmoji && (
            <div className="absolute z-10 mt-1 flex gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-md">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} className="rounded-full px-1 text-sm hover:bg-muted" onClick={() => { onReact(e); setShowEmoji(false); }}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <button className="text-muted-foreground hover:text-foreground" title="Yanıtla" onClick={onReply}><CornerUpLeft className="size-3.5" /></button>
        {mine && m.kind !== "voice" && m.body && (
          <button className="text-muted-foreground hover:text-foreground" title="Düzenle" onClick={onEdit}><Pencil className="size-3.5" /></button>
        )}
        {(mine || canModerate) && (
          <button className="text-muted-foreground hover:text-destructive" title="Sil" onClick={onDelete}><Trash2 className="size-3.5" /></button>
        )}
      </div>
    </div>
  );
}

function RefCardView({ card, mine, onOpen }: { card: ChatRefCard; mine: boolean; onOpen?: (c: ChatRefCard) => void }) {
  const Icon = REF_ICON[card.type] ?? FileText;
  return (
    <button
      type="button" disabled={card.missing} onClick={() => onOpen?.(card)}
      className={cn("mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs", mine ? "bg-primary-foreground/15" : "bg-background", card.missing ? "opacity-60" : "hover:opacity-90")}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{card.title}</span>
        {card.subtitle && <span className="block truncate opacity-75">{card.subtitle}</span>}
      </span>
    </button>
  );
}
