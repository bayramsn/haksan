import { useEffect, useState, type ReactNode } from "react";
import { AlarmClock, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import type { SalesCase } from "../../lib/mock";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const toLocalInputValue = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const actionDateLabel = (value?: string) => {
  if (!value) return "Tarih belirlenmedi";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih belirlenmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const isActionOverdue = (value?: string) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
};

export function NextActionDialog({
  salesCase,
  onSave,
  trigger,
}: {
  salesCase: SalesCase;
  onSave: (patch: { nextAction: string | null; nextActionAt: string | null }) => Promise<void>;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(salesCase.nextAction ?? "");
  const [actionAt, setActionAt] = useState(toLocalInputValue(salesCase.nextActionAt));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAction(salesCase.nextAction ?? "");
    setActionAt(toLocalInputValue(salesCase.nextActionAt));
  }, [open, salesCase.nextAction, salesCase.nextActionAt]);

  const save = async () => {
    const nextAction = action.trim();
    if (!nextAction) {
      toast.error("Sonraki aksiyonu yazın");
      return;
    }
    const parsedDate = actionAt ? new Date(actionAt) : null;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      toast.error("Geçerli bir takip tarihi seçin");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        nextAction,
        nextActionAt: parsedDate ? parsedDate.toISOString() : null,
      });
      toast.success("Sonraki aksiyon kaydedildi", {
        description: actionAt ? actionDateLabel(parsedDate?.toISOString()) : "Tarih belirlenmedi",
      });
      setOpen(false);
    } catch (error: any) {
      toast.error("Aksiyon kaydedilemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[10px]">
            <AlarmClock className="size-3.5" />
            {salesCase.nextAction ? "Aksiyonu düzenle" : "Aksiyon planla"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sonraki aksiyonu planla</DialogTitle>
          <DialogDescription>
            Kartın yeniden açılmasını gerektirmeden, satışçının yapacağı ilk somut işi ve zamanını belirleyin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`next-action-${salesCase.id}`}>Aksiyon *</Label>
            <Textarea
              id={`next-action-${salesCase.id}`}
              className="mt-1.5 min-h-24"
              maxLength={1000}
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="Örn. Teknik ihtiyaç listesini teyit etmek için satın alma müdürünü ara"
            />
            <div className="mt-1 text-right font-data text-[9px] text-muted-foreground">
              {action.length}/1000
            </div>
          </div>
          <div>
            <Label htmlFor={`next-action-at-${salesCase.id}`} className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> Takip zamanı
            </Label>
            <Input
              id={`next-action-at-${salesCase.id}`}
              className="mt-1.5"
              type="datetime-local"
              value={actionAt}
              onChange={(event) => setActionAt(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          <Button type="button" disabled={saving || !action.trim()} onClick={() => void save()}>
            {saving ? "Kaydediliyor…" : "Aksiyonu Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
