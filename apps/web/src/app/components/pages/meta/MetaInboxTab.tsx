import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MessageCircleReply, Search, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import {
  getMetaErrorMessage,
  metaQueryKeys,
  metaService,
  type MetaComment,
  type MetaConversation,
} from "../../../../lib/meta-service";
import {
  formatMetaDate,
  MetaEmpty,
  MetaErrorState,
  MetaPagination,
  MetaPlatformMark,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
} from "./meta-shared";

const PAGE_SIZE = 20;

export function MetaInboxTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<"messages" | "comments">("messages");
  const [connectionId, setConnectionId] = useState("");
  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 60_000 });
  useEffect(() => {
    if (!connectionId) setConnectionId(connectionsQuery.data?.find((item) => item.status === "active")?.id ?? "");
  }, [connectionId, connectionsQuery.data]);
  return (
    <div className="space-y-4">
      <div className="flex max-w-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-1 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          <button type="button" onClick={() => setView("messages")} className={`h-9 shrink-0 rounded-lg px-4 text-sm font-medium ${view === "messages" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Mesajlar</button>
          <button type="button" onClick={() => setView("comments")} className={`h-9 shrink-0 rounded-lg px-4 text-sm font-medium ${view === "comments" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Yorumlar</button>
        </div>
        <Select value={connectionId} onValueChange={setConnectionId}>
          <SelectTrigger size="sm" className="w-full sm:w-[220px]" aria-label="Meta mesaj bağlantısı"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger>
          <SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {view === "messages" ? <ConversationPanel canManage={canManage} connectionId={connectionId} /> : <CommentsPanel canManage={canManage} connectionId={connectionId} />}
    </div>
  );
}

function ConversationPanel({ canManage, connectionId }: { canManage: boolean; connectionId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MetaConversation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSelected(null);
    setMessage("");
  }, [connectionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const params = { page, pageSize: PAGE_SIZE, search: search || undefined, connectionId: connectionId || undefined };
  const conversationsQuery = useQuery({
    queryKey: metaQueryKeys.conversations(params),
    queryFn: () => metaService.conversations(params),
    enabled: Boolean(connectionId),
    staleTime: 15_000,
  });
  const messagesQuery = useQuery({
    queryKey: metaQueryKeys.messages(selected?.id ?? "none", selected?.connectionId),
    queryFn: () => metaService.messages(selected!.id, { connectionId: selected!.connectionId }),
    enabled: Boolean(selected),
    staleTime: 5_000,
  });
  const sendMutation = useMutation({
    mutationFn: () => metaService.sendMessage(selected!, { message: message.trim() }),
    onSuccess: async () => {
      setMessage("");
      toast.success("Mesaj gönderildi");
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.messages(selected!.id, selected!.connectionId) });
      await queryClient.invalidateQueries({ queryKey: ["meta", "conversations"] });
    },
    onError: (error) => toast.error("Mesaj gönderilemedi", { description: getMetaErrorMessage(error) }),
  });

  return (
    <MetaSurface className="overflow-hidden">
      <MetaSectionHeader title="Ortak mesaj kutusu" description="Instagram, Messenger ve WhatsApp konuşmalarını CRM bağlamıyla yönetin." />
      <div className="grid min-h-[560px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-border/70 lg:border-b-0 lg:border-r">
          <div className="p-3">
            <label className="relative block" htmlFor="meta-conversation-search">
              <span className="sr-only">Konuşma ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="meta-conversation-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Kişi veya mesaj ara" className="pl-9" />
            </label>
          </div>
          {conversationsQuery.isError ? (
            <MetaErrorState error={getMetaErrorMessage(conversationsQuery.error)} onRetry={() => void conversationsQuery.refetch()} />
          ) : (conversationsQuery.data?.items.length ?? 0) === 0 && !conversationsQuery.isLoading ? (
            <MetaEmpty title="Konuşma bulunamadı" description="Müşteriler mesaj gönderdiğinde konuşmalar burada açılır." />
          ) : (
            <div className="max-h-[455px] overflow-y-auto border-y border-border/70">
              {(conversationsQuery.data?.items ?? []).map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => setSelected(conversation)}
                  className={`flex w-full min-w-0 items-start gap-3 border-b border-border/60 px-3 py-3 text-left last:border-b-0 hover:bg-muted/50 ${selected?.id === conversation.id ? "bg-brand-blue-soft" : ""}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/10 bg-card"><MetaPlatformMark platform={conversation.platform} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{conversation.participantName}</span>
                      <time className="shrink-0 text-[9px] text-muted-foreground">{formatMetaDate(conversation.lastMessageAt)}</time>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.preview || "Mesaj önizlemesi yok"}</span>
                    <span className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {conversation.unreadCount > 0 && <MetaStatusBadge status="new" label={`${conversation.unreadCount} okunmamış`} />}
                      {conversation.assignedUserName ?? "Atama yok"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {conversationsQuery.data && <MetaPagination {...conversationsQuery.data} onPageChange={setPage} />}
        </aside>

        <section className="flex min-h-[500px] min-w-0 flex-col">
          {!selected ? (
            <MetaEmpty title="Bir konuşma seçin" description="Mesaj geçmişini okumak ve yanıtlamak için soldan bir konuşma açın." />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selected.participantName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{selected.participantHandle || selected.platform} / {selected.assignedUserName ?? "Atama yok"}</p>
                </div>
                <MetaPlatformMark platform={selected.platform} showLabel />
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-surface-subtle p-4" aria-live="polite">
                {messagesQuery.isError ? (
                  <MetaErrorState error={getMetaErrorMessage(messagesQuery.error)} onRetry={() => void messagesQuery.refetch()} />
                ) : (messagesQuery.data ?? []).length === 0 && !messagesQuery.isLoading ? (
                  <MetaEmpty title="Mesaj geçmişi boş" description="Yeni mesajlar burada tarih sırasıyla görünür." />
                ) : (messagesQuery.data ?? []).map((item) => (
                  <div key={item.id} className={`flex ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-xl border px-3 py-2 text-sm shadow-xs ${item.direction === "outbound" ? "border-primary/20 bg-primary text-primary-foreground" : "border-border/70 bg-card"}`}>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{item.body}</p>
                      <p className={`mt-1 text-[9px] ${item.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatMetaDate(item.createdAt)}{item.status ? ` / ${item.status}` : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="border-t border-border/70 bg-card p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (message.trim()) sendMutation.mutate();
                }}
              >
                {!selected.canReply && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-2 text-xs text-warning">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> Yanıt penceresi kapalı. WhatsApp için onaylı şablon gerekebilir.
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="meta-message" className="sr-only">Mesaj</label>
                    <Textarea id="meta-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder="Yanıtınızı yazın" className="min-h-20" disabled={!canManage || !selected.canReply} />
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">{message.length}/1000</p>
                  </div>
                  <Button type="submit" size="icon" disabled={!canManage || !selected.canReply || !message.trim() || sendMutation.isPending} aria-label="Mesajı gönder">
                    <Send className="size-4" />
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </MetaSurface>
  );
}

function CommentsPanel({ canManage, connectionId }: { canManage: boolean; connectionId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<MetaComment | null>(null);
  const [reply, setReply] = useState("");
  const [visibilityChange, setVisibilityChange] = useState<MetaComment | null>(null);
  const params = { page, pageSize: PAGE_SIZE, connectionId: connectionId || undefined };
  const commentsQuery = useQuery({
    queryKey: metaQueryKeys.comments(params),
    queryFn: () => metaService.comments(params),
    enabled: Boolean(connectionId),
    staleTime: 15_000,
  });
  const replyMutation = useMutation({
    mutationFn: () => metaService.replyToComment(replying!.id, { connectionId: replying!.connectionId, message: reply.trim() }),
    onSuccess: async () => {
      toast.success("Yanıt yayınlandı");
      setReplying(null);
      setReply("");
      await queryClient.invalidateQueries({ queryKey: ["meta", "comments"] });
    },
    onError: (error) => toast.error("Yorum yanıtlanamadı", { description: getMetaErrorMessage(error) }),
  });
  const visibilityMutation = useMutation({
    mutationFn: (comment: MetaComment) => metaService.updateComment(comment.id, { connectionId: comment.connectionId, isHidden: !comment.isHidden }),
    onSuccess: async () => {
      toast.success("Yorum görünürlüğü güncellendi");
      setVisibilityChange(null);
      await queryClient.invalidateQueries({ queryKey: ["meta", "comments"] });
    },
    onError: (error) => toast.error("Yorum güncellenemedi", { description: getMetaErrorMessage(error) }),
  });

  return (
    <MetaSurface>
      <MetaSectionHeader title="Yorum yönetimi" description="Instagram ve Facebook yorumlarını yanıtlayın veya gerektiğinde gizleyin." />
      {commentsQuery.isError ? (
        <MetaErrorState error={getMetaErrorMessage(commentsQuery.error)} onRetry={() => void commentsQuery.refetch()} />
      ) : (commentsQuery.data?.items.length ?? 0) === 0 && !commentsQuery.isLoading ? (
        <MetaEmpty title="Yorum bulunamadı" description="Bağlı gönderilere gelen yorumlar burada yönetilebilir." />
      ) : (
        <div className="divide-y divide-border/70">
          {(commentsQuery.data?.items ?? []).map((comment) => (
            <article key={comment.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto]">
              <span className="grid size-10 place-items-center rounded-lg border border-primary/10 bg-brand-blue-soft"><MetaPlatformMark platform={comment.platform} /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{comment.authorName}</p>
                  {comment.isHidden && <MetaStatusBadge status="paused" label="Gizli" />}
                  <time className="text-[10px] text-muted-foreground">{formatMetaDate(comment.createdAt)}</time>
                </div>
                <p className="mt-1 text-sm leading-relaxed">{comment.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{comment.postName ?? "Gönderi bilgisi yok"}</p>
              </div>
              <div className="flex items-start gap-1">
                <Button type="button" variant="outline" size="sm" disabled={!canManage || !comment.canReply} onClick={() => setReplying(comment)}><MessageCircleReply className="size-3.5" /> Yanıtla</Button>
                <Button type="button" variant="ghost" size="icon" disabled={!canManage} onClick={() => setVisibilityChange(comment)} aria-label={comment.isHidden ? "Yorumu göster" : "Yorumu gizle"}>
                  {comment.isHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {commentsQuery.data && <MetaPagination {...commentsQuery.data} onPageChange={setPage} />}

      <Dialog open={Boolean(replying)} onOpenChange={(open) => !open && setReplying(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yorumu yanıtla</DialogTitle><DialogDescription>Yanıt bağlı Meta hesabından herkese açık yayınlanır.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-border/70 bg-surface-subtle p-3 text-sm">{replying?.message}</div>
          <div className="space-y-2">
            <label htmlFor="meta-comment-reply" className="text-sm font-medium">Yanıt</label>
            <Textarea id="meta-comment-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={800} />
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setReplying(null)}>Vazgeç</Button><Button type="button" disabled={!reply.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate()}>Yanıtı yayınla</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(visibilityChange)} onOpenChange={(open) => !open && setVisibilityChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Yorum görünürlüğünü değiştir</AlertDialogTitle><AlertDialogDescription>Yorum {visibilityChange?.isHidden ? "yeniden gösterilecek" : "gizlenecek"}. İşlem Meta gönderisine uygulanır.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction disabled={!visibilityChange || visibilityMutation.isPending} onClick={() => visibilityChange && visibilityMutation.mutate(visibilityChange)}>{visibilityChange?.isHidden ? "Yorumu göster" : "Yorumu gizle"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MetaSurface>
  );
}
