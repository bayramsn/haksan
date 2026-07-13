import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { adminService } from "../../../lib/services";

type DeptTarget = {
  salesAmount: string;
  quoteTarget: string;
  visitTarget: string;
  note: string;
};

const emptyTarget = (): DeptTarget => ({ salesAmount: "", quoteTarget: "", visitTarget: "", note: "" });

export function DepartmentTargetDialog({
  department,
  period,
  onClose,
  onSaved,
}: {
  department: { id: string; name: string } | null;
  period: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<DeptTarget>(emptyTarget());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!department) return;
    setLoading(true);
    adminService
      .departmentTargets({ period })
      .then((rows: any[]) => {
        const row = rows.find((r) => r.departmentId === department.id);
        if (!row) {
          setForm(emptyTarget());
          return;
        }
        setForm({
          salesAmount: row.salesAmount ?? "",
          quoteTarget: row.quoteTarget != null ? String(row.quoteTarget) : "",
          visitTarget: row.visitTarget != null ? String(row.visitTarget) : "",
          note: row.note ?? "",
        });
      })
      .catch(() => setForm(emptyTarget()))
      .finally(() => setLoading(false));
  }, [department, period]);

  if (!department) return null;

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminService.saveDepartmentTarget(department.id, {
        period,
        currency: "USD",
        salesAmount: numOrNull(form.salesAmount),
        quoteTarget: numOrNull(form.quoteTarget),
        visitTarget: numOrNull(form.visitTarget),
        salesNewCustomers: null,
        serviceAmount: null,
        serviceCompleted: null,
        digitalLeadTarget: null,
        digitalConversionTarget: null,
        digitalBudget: null,
        callTarget: null,
        targetItems: [],
        note: form.note.trim() || undefined,
      });
      toast.success("Departman hedefi kaydedildi");
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error("Kaydedilemedi", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!department} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Departman Hedefi · {department.name}</DialogTitle>
          <DialogDescription>{period} dönemi için satış ve aktivite hedefleri.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="text-xs">Satış Hedefi (USD)</Label>
              <Input className="mt-1.5" type="number" min={0} value={form.salesAmount} onChange={(e) => setForm({ ...form, salesAmount: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Teklif Adedi Hedefi</Label>
              <Input className="mt-1.5" type="number" min={0} value={form.quoteTarget} onChange={(e) => setForm({ ...form, quoteTarget: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Ziyaret Hedefi</Label>
              <Input className="mt-1.5" type="number" min={0} value={form.visitTarget} onChange={(e) => setForm({ ...form, visitTarget: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Not</Label>
              <Textarea className="mt-1.5" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>İptal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentTargetButton({
  department,
  period,
  hasTarget,
  onSaved,
}: {
  department: { id: string; name: string };
  period: string;
  hasTarget: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <TrendingUp className="size-3.5" />
        {hasTarget ? "Hedef ✓" : "Hedef"}
      </Button>
      {open && (
        <DepartmentTargetDialog
          department={department}
          period={period}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
