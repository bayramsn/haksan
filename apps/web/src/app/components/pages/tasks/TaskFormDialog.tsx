import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  TASK_PRIORITIES,
  TASK_REMINDER_OPTIONS,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@haksan/shared";
import { tasksService, type TaskDTO, type TaskInput } from "../../../../lib/services";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { RemoteCompanyCombobox } from "../../shared/RemoteCompanyCombobox";
import { RemoteContactCombobox } from "../../shared/RemoteContactCombobox";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, toLocalInput } from "./taskPresentation";

/**
 * İlgili kayıt bir üst ekrandan geldiğinde (müşteri detayı, lead, teklif…)
 * kullanıcı aynı kaydı tekrar seçmek zorunda kalmasın diye kilitli gelir.
 */
export type TaskRelation = {
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  serviceTicketId?: string | null;
  /** Kilitli alanın kullanıcıya gösterilen adı (ör. "ABC Makina"). */
  label?: string;
};

type FormState = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToUserId: string;
  dueAt: string;
  remindBeforeMinutes: string;
  companyId: string | null;
  contactId: string | null;
};

function emptyForm(relation?: TaskRelation): FormState {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "normal",
    assignedToUserId: "",
    dueAt: "",
    remindBeforeMinutes: "",
    companyId: relation?.companyId ?? null,
    contactId: relation?.contactId ?? null,
  };
}

function fromTask(task: TaskDTO): FormState {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    assignedToUserId: task.assignedToUserId ?? "",
    dueAt: toLocalInput(task.dueAt),
    remindBeforeMinutes: task.remindBeforeMinutes === null ? "" : String(task.remindBeforeMinutes),
    companyId: task.companyId,
    contactId: task.contactId,
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  relation,
  assignees,
  currentUserId,
  onSaved,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dolu ise düzenleme, boş ise yeni görev. */
  task?: TaskDTO | null;
  relation?: TaskRelation;
  assignees: Array<{ id: string; fullName: string }>;
  currentUserId?: string;
  onSaved: (task: TaskDTO) => void;
  trigger?: ReactNode;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(relation));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(task ? fromTask(task) : emptyForm(relation));
  }, [open, task?.id, relation?.companyId, relation?.opportunityId, relation?.quoteId, relation?.serviceTicketId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // İlgili kayıt üstten geldiyse firma/kontak seçicilerini göstermeye gerek yok.
  const lockedRelation = useMemo(
    () => Boolean(relation?.opportunityId || relation?.quoteId || relation?.serviceTicketId || relation?.companyId),
    [relation]
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("Görev adı zorunlu");
      return;
    }
    setSaving(true);
    try {
      const payload: TaskInput = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assignedToUserId: form.assignedToUserId || currentUserId || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        remindBeforeMinutes: form.remindBeforeMinutes === "" ? null : Number(form.remindBeforeMinutes),
        companyId: relation?.companyId ?? form.companyId,
        contactId: relation?.contactId ?? form.contactId,
        opportunityId: relation?.opportunityId ?? task?.opportunityId ?? null,
        quoteId: relation?.quoteId ?? task?.quoteId ?? null,
        serviceTicketId: relation?.serviceTicketId ?? task?.serviceTicketId ?? null,
      };
      const saved = task ? await tasksService.update(task.id, payload) : await tasksService.create(payload);
      toast.success(task ? "Görev güncellendi" : "Görev oluşturuldu");
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görev kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{task ? "Görevi düzenle" : "Yeni görev"}</DialogTitle>
            <DialogDescription>
              {relation?.label
                ? `${relation.label} kaydına bağlı görev.`
                : "Kısa bir başlık, sorumlu ve son tarih yeterli."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Görev adı" className="sm:col-span-2">
              <Input
                autoFocus
                required
                maxLength={255}
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Örn. Teklif için geri dönüş yap"
              />
            </Field>

            <Field label="Atanacak kullanıcı">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.assignedToUserId}
                onChange={(event) => set("assignedToUserId", event.target.value)}
              >
                <option value="">Kendim</option>
                {assignees
                  .filter((user) => user.id !== currentUserId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Öncelik">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.priority}
                onChange={(event) => set("priority", event.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {TASK_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Son tarih ve saat">
              <Input type="datetime-local" value={form.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
            </Field>

            <Field label="Hatırlatma">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.remindBeforeMinutes}
                onChange={(event) => set("remindBeforeMinutes", event.target.value)}
                disabled={!form.dueAt}
              >
                <option value="">Hatırlatma yok</option>
                {TASK_REMINDER_OPTIONS.map((option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {task && (
              <Field label="Durum">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(event) => set("status", event.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {TASK_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {!lockedRelation && (
              <>
                <Field label="İlgili firma">
                  <RemoteCompanyCombobox
                    value={form.companyId}
                    onValueChange={(companyId) => setForm((prev) => ({ ...prev, companyId, contactId: null }))}
                    placeholder="Firma seçin…"
                  />
                </Field>
                <Field label="İlgili kontak">
                  <RemoteContactCombobox
                    value={form.contactId}
                    companyId={form.companyId ?? undefined}
                    onValueChange={(contactId) => set("contactId", contactId)}
                    placeholder="Kontak seçin…"
                  />
                </Field>
              </>
            )}

            <Field label="Açıklama" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Gerekliyse kısa bir not."
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="block space-y-1.5">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {children}
      </Label>
    </div>
  );
}
