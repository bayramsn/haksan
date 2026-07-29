import { useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../../ui/dialog";
import { ScrollArea } from "../../ui/scroll-area";
import { Badge } from "../../ui/badge";
import { chatService, type ChatConversationDetail, type ChatDirectoryUser } from "../../../../lib/services";
import { toast } from "sonner";
import { Plus, Settings2, Trash2, ShieldCheck, Shield, Check, Loader2 } from "lucide-react";

function errMsg(e: unknown): string {
  return (e as { message?: string })?.message ?? "İşlem başarısız";
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Süper admin için grup kurma diyaloğu. */
export function NewGroupDialog({
  directory,
  onCreated,
}: {
  directory: ChatDirectoryUser[];
  onCreated: (detail: ChatConversationDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [onlyAdminsCanPost, setOnlyAdmins] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reset = () => {
    setTitle(""); setDescription(""); setOnlyAdmins(true); setSelected(new Set());
  };

  const create = async () => {
    if (!title.trim()) { toast.error("Grup adı gerekli"); return; }
    setSaving(true);
    try {
      const detail = await chatService.createGroup({
        title: title.trim(),
        description: description.trim() || undefined,
        onlyAdminsCanPost,
        memberUserIds: [...selected],
      });
      toast.success("Grup oluşturuldu");
      setOpen(false); reset();
      onCreated(detail);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-4" /> Yeni Grup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Grup</DialogTitle>
          <DialogDescription>Grup kurma yetkisi yalnızca Süper Admin'dedir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-chat-group-title">Grup adı</Label>
            <Input id="new-chat-group-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Satış Ekibi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-chat-group-description">Açıklama (opsiyonel)</Label>
            <Textarea id="new-chat-group-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Yalnızca yöneticiler yazabilir</div>
              <div className="text-xs text-muted-foreground">Duyuru grubu modu (WhatsApp benzeri)</div>
            </div>
            <Switch aria-label="Yalnızca yöneticiler yazabilir" checked={onlyAdminsCanPost} onCheckedChange={setOnlyAdmins} />
          </div>
          <div className="space-y-1.5">
            <Label>Üyeler ({selected.size})</Label>
            <ScrollArea className="h-48 rounded-md border border-border/60">
              <div className="p-1.5 space-y-0.5">
                {directory.map((u) => {
                  const on = selected.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${on ? "bg-primary/10" : "hover:bg-muted"}`}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                        {initials(u.fullName)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{u.fullName}</span>
                      {on && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
                {directory.length === 0 && (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">Başka çalışan yok</div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Grup ayarları: üye ekle/çıkar, yöneticilik ver/al, "yalnız yönetici yazar" anahtarı.
 * Yalnız süper admin veya grup admini görür/yönetir (isManager). */
export function GroupSettingsDialog({
  detail,
  directory,
  isManager,
  currentUserId,
  onChanged,
}: {
  detail: ChatConversationDetail;
  directory: ChatDirectoryUser[];
  isManager: boolean;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const memberIds = new Set(detail.members.map((m) => m.userId));
  const addable = directory.filter((u) => !memberIds.has(u.id));

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Grup ayarları">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{detail.title ?? "Grup"} · Ayarlar</DialogTitle>
          <DialogDescription>
            {isManager ? "Üyeleri ve yöneticilik ayarlarını düzenleyin." : "Grup üyeleri ve ayarları."}
          </DialogDescription>
        </DialogHeader>

        {isManager && (
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div className="text-sm font-medium">Yalnızca yöneticiler yazabilir</div>
            <Switch
              checked={detail.onlyAdminsCanPost}
              disabled={busy}
              onCheckedChange={(v) => run(() => chatService.updateGroup(detail.id, { onlyAdminsCanPost: v }))}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Üyeler ({detail.members.length})</Label>
          <ScrollArea className="h-44 rounded-md border border-border/60">
            <div className="p-1.5 space-y-0.5">
              {detail.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                    {initials(m.fullName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.fullName}
                    {m.userId === currentUserId && <span className="text-muted-foreground"> (siz)</span>}
                  </span>
                  {m.role === "admin" ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]"><ShieldCheck className="size-3" /> Yönetici</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Üye</Badge>
                  )}
                  {isManager && (
                    <>
                      <Button
                        variant="ghost" size="icon" disabled={busy}
                        title={m.role === "admin" ? "Yöneticiliği al" : "Yönetici yap"}
                        onClick={() =>
                          run(() => chatService.setMemberRole(detail.id, m.userId, m.role === "admin" ? "member" : "admin"))
                        }
                      >
                        {m.role === "admin" ? <Shield className="size-4" /> : <ShieldCheck className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" disabled={busy} title="Gruptan çıkar"
                        onClick={() => run(() => chatService.removeMember(detail.id, m.userId), "Üye çıkarıldı")}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {isManager && addable.length > 0 && (
          <div className="space-y-1.5">
            <Label>Üye ekle</Label>
            <ScrollArea className="h-36 rounded-md border border-border/60">
              <div className="p-1.5 space-y-0.5">
                {addable.map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                      {initials(u.fullName)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{u.fullName}</span>
                    <Button
                      variant="outline" size="sm" disabled={busy} className="gap-1"
                      onClick={() => run(() => chatService.addMembers(detail.id, [u.id]), "Üye eklendi")}
                    >
                      <Plus className="size-3.5" /> Ekle
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
