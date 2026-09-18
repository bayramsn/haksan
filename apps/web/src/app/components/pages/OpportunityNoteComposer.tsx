import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

/** Uses the existing activity API, permissions and refresh path. */
export function OpportunityNoteComposer({ opportunityId, companyId, contactId }: {
  opportunityId: string; companyId?: string; contactId?: string;
}) {
  const { user, hasPermission } = useAuth();
  const { addActivity } = useStore();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  if (!hasPermission("activities.create")) return null;

  const save = async () => {
    const clean = note.trim();
    if (!clean || saving) return;
    setSaving(true);
    setError("");
    try {
      await addActivity({
        salesCaseId: opportunityId, customerId: companyId || "", contactId,
        type: "Not", title: "Fırsat notu", note: clean, byUserId: user?.id || "",
        date: new Date().toISOString(),
      });
      setNote("");
      setSaved(true);
    } catch {
      setError("Not kaydedilemedi. Yazdıklarınız burada duruyor; tekrar deneyin.");
      toast.error("Not kaydedilemedi");
    } finally { setSaving(false); }
  };

  return (
    <form className="opportunity-note-composer" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor={`opportunity-note-${opportunityId}`} className="sr-only">Not yaz</label>
      <Textarea id={`opportunity-note-${opportunityId}`} value={note} maxLength={4000}
        placeholder="Bir not yazın…" disabled={saving}
        onChange={(event) => { setNote(event.target.value); setSaved(false); }}
        className="min-h-24 resize-y border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-1"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <span className="text-xs text-muted-foreground" role="status">
          {saved ? <span className="inline-flex items-center gap-1"><Check className="size-3.5" /> Kaydedildi</span> : "Ekip içi not"}
        </span>
        <Button type="submit" variant="outline" size="sm" disabled={saving || !note.trim()} className="gap-1.5">
          {saving ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Send className="size-3.5" />}
          {saving ? "Kaydediliyor…" : "Not ekle"}
        </Button>
      </div>
      {error && <p role="alert" className="px-3 pb-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}
