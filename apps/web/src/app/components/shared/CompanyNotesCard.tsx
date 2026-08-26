import { useEffect, useState } from "react";
import { NotebookText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";

const EMPTY_NOTE = "Bu firma için henüz not eklenmemiş.";

/**
 * Firma notu: satır içinde özet, pop-up'ta tamamı. Not uzun olduğunda kutu
 * kırpıyordu ve düzenlemek için firma düzenleme formunu açmak gerekiyordu;
 * buradaki pencere notu tam gösterir ve yerinde kaydeder.
 */
export function CompanyNotesCard({
  companyId,
  companyName,
  note,
  className = "",
}: {
  companyId: string;
  companyName?: string;
  note?: string | null;
  className?: string;
}) {
  const { updateCustomer } = useStore();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("companies.update");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  /**
   * Firma kartı/penceresi notu prop olarak anlık görüntüden alıyor; kaydettikten
   * sonra tazelenene kadar eski metni gösteriyordu. Son kaydedilen değer burada
   * tutulur, prop güncellenince kendiliğinden devreden çıkar.
   */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const shownNote = savedNote ?? note ?? "";

  useEffect(() => { setSavedNote(null); }, [note]);

  // Pencere her açılışta kayıtlı notla başlar; iptal edilen düzenleme sızmaz.
  useEffect(() => { if (open) setDraft(shownNote); }, [open, shownNote]);

  const save = async () => {
    setSaving(true);
    try {
      const next = draft.trim();
      await updateCustomer(companyId, { initialNote: next });
      setSavedNote(next);
      toast.success("Firma notu kaydedildi", { description: companyName });
      setOpen(false);
    } catch (error: any) {
      toast.error("Firma notu kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className={`overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/45 ${className}`} aria-label="Firma notları">
        <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-950">
          <NotebookText className="size-3.5 text-amber-700" />
          Firma Notları
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-2 text-[11px] text-amber-900 hover:bg-amber-100/80"
            onClick={() => setOpen(true)}
          >
            <Pencil className="size-3" /> {canEdit ? "Düzenle" : "Tümünü gör"}
          </Button>
        </div>
        <div className={`max-h-40 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed ${shownNote.trim() ? "text-foreground" : "text-muted-foreground"}`}>
          {shownNote.trim() || EMPTY_NOTE}
        </div>
      </section>

      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Firma Notları</DialogTitle>
            <DialogDescription>{companyName ?? "Firma kartındaki serbest not."}</DialogDescription>
          </DialogHeader>

          {canEdit ? (
            <Textarea
              aria-label="Firma notu"
              className="min-h-64 resize-y leading-relaxed"
              value={draft}
              maxLength={4000}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Firmaya dair notlar…"
            />
          ) : (
            <div className="min-h-32 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed">
              {shownNote.trim() || EMPTY_NOTE}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {canEdit ? "Vazgeç" : "Kapat"}
            </Button>
            {canEdit && (
              <Button onClick={() => void save()} disabled={saving || draft === shownNote}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
