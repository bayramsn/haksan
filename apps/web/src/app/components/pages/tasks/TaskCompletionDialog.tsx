import { useEffect, useState, type FormEvent } from "react";
import { TASK_COMPLETION_NOTE_MAX_LENGTH } from "@haksan/shared";
import { toast } from "sonner";
import { tasksService, type TaskDetailDTO, type TaskDTO } from "../../../../lib/services";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";

export function TaskCompletionDialog({ task, onOpenChange, onCompleted }: {
  task: TaskDTO | null;
  onOpenChange: (open: boolean) => void;
  onCompleted: (task: TaskDetailDTO) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setNote(""); setError(null); }, [task?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!task || !note.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await tasksService.update(task.id, { status: "done", completionNote: note.trim() });
      onCompleted(updated);
      onOpenChange(false);
      toast.success("Görev tamamlama notuyla kaydedildi");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Görev tamamlanamadı. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(open) => { if (!saving) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Görevi tamamla</DialogTitle>
            <DialogDescription>{task?.title} — Yapılan işi ve sonucunu yazın. Not, görev geçmişine kaydedilir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-completion-note">Tamamlama notu (zorunlu)</Label>
            <Textarea id="task-completion-note" autoFocus required value={note} disabled={saving}
              onChange={(event) => setNote(event.target.value)} maxLength={TASK_COMPLETION_NOTE_MAX_LENGTH}
              placeholder="Örn. Müşteri arandı, teklif iletildi ve teslim tarihi netleştirildi."
              className="min-h-28" aria-describedby="task-completion-help" />
            <p id="task-completion-help" className="text-xs text-muted-foreground">
              Not yazmadan görev tamamlanamaz. {note.length}/{TASK_COMPLETION_NOTE_MAX_LENGTH}
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving || !note.trim()}>{saving ? "Kaydediliyor…" : "Notu kaydet ve tamamla"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
