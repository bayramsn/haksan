import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { serviceService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";

type Plan = {
  id: string;
  title: string;
  intervalDays: number;
  nextDueDate: string;
  lastServiceDate: string | null;
  reminderLeadDays: number;
  autoCreateTicket: boolean;
  isActive: boolean;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return "—";
  }
}

function dueTone(iso: string): "overdue" | "soon" | "ok" {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "overdue";
  if (days <= 30) return "soon";
  return "ok";
}

/** Makine detayında periyodik bakım planı — oluştur, tamamla, kaldır. */
export function MaintenancePlanPanel({ customerDeviceId }: { customerDeviceId: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("service_tickets.create");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [intervalDays, setIntervalDays] = useState(180);
  const [autoTicket, setAutoTicket] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await serviceService.maintenancePlans({ customerDeviceId, limit: 20 });
      setPlans((res.data ?? []) as Plan[]);
    } catch {
      /* sessiz — panel boş kalır */
    } finally {
      setLoading(false);
    }
  }, [customerDeviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setAdding(true);
    try {
      await serviceService.createMaintenancePlan({
        customerDeviceId,
        intervalDays,
        autoCreateTicket: autoTicket,
      });
      toast.success("Bakım planı oluşturuldu");
      await load();
    } catch (err: any) {
      toast.error("Plan oluşturulamadı", { description: err?.message });
    } finally {
      setAdding(false);
    }
  };

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      await serviceService.completeMaintenancePlan(id);
      toast.success("Bakım yapıldı olarak işaretlendi");
      await load();
    } catch (err: any) {
      toast.error("İşaretlenemedi", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await serviceService.deleteMaintenancePlan(id);
      await load();
    } catch (err: any) {
      toast.error("Plan kaldırılamadı", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-5 text-primary" /> Önleyici bakım planı
        </CardTitle>
        {canManage && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={autoTicket} onCheckedChange={setAutoTicket} /> Otomatik talep
            </label>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Input
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-20"
                aria-label="Bakım aralığı (gün)"
              />
              gün
            </div>
            <Button size="sm" className="h-8 gap-1" disabled={adding} onClick={() => void create()}>
              <Plus className="size-4" /> Plan ekle
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        ) : plans.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Bu makine için periyodik bakım planı yok. Aralık belirleyip “Plan ekle” ile kurun.
          </div>
        ) : (
          plans.map((plan) => {
            const tone = dueTone(plan.nextDueDate);
            return (
              <div key={plan.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {plan.title}
                    {plan.autoCreateTicket && (
                      <span className="chip chip-info">
                        <Wrench className="size-3" /> Oto talep
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Her {plan.intervalDays} günde · Son bakım: {fmt(plan.lastServiceDate)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`chip ${tone === "overdue" ? "chip-destructive" : tone === "soon" ? "chip-warning" : "chip-success"}`}>
                    {tone === "overdue" ? "Gecikti" : "Vade"} · {fmt(plan.nextDueDate)}
                  </span>
                  {canManage && (
                    <>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Bakım yapıldı" disabled={busyId === plan.id} onClick={() => void complete(plan.id)}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive-soft" aria-label="Planı kaldır" disabled={busyId === plan.id} onClick={() => void remove(plan.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
