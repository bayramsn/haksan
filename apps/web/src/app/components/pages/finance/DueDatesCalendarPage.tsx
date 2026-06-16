import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { financeService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

type DueItem = {
  id: string;
  companyId: string;
  companyName: string;
  dueDate: string;
  amount: number;
  currencyCode: string;
  invoiceNo: string | null;
  type: "borc" | "alacak";
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startWeekday(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export function DueDatesCalendarPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [items, setItems] = useState<DueItem[]>([]);

  const range = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, 1);
    const to = new Date(cursor.year, cursor.month + 1, 0, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [cursor]);

  useEffect(() => {
    financeService.dueDates(range).then((rows) => setItems(rows ?? [])).catch(() => setItems([]));
  }, [range.from, range.to]);

  const byDay = useMemo(() => {
    const map = new Map<number, DueItem[]>();
    for (const item of items) {
      if (item.type === "alacak" && !isAdmin) continue;
      const d = new Date(item.dueDate);
      if (d.getFullYear() !== cursor.year || d.getMonth() !== cursor.month) continue;
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return map;
  }, [items, cursor, isAdmin]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const totalDays = daysInMonth(cursor.year, cursor.month);
  const pad = startWeekday(cursor.year, cursor.month);
  const cells: (number | null)[] = [...Array(pad).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  return (
    <div className="space-y-5">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="tracking-tight flex items-center gap-2"><Calendar className="size-5" /> Vade Takvimi</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Tahsil ve ödeme vadeleri · {monthLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="size-8" onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground mb-2">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="min-h-[88px] rounded-md bg-muted/10" />;
              const dayItems = byDay.get(day) ?? [];
              return (
                <div key={day} className={`min-h-[88px] rounded-md border p-1.5 text-left ${dayItems.length ? "border-amber-200 bg-amber-50/40" : "border-border/50 bg-white"}`}>
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((it) => (
                      <div key={it.id} className="rounded px-1 py-0.5 text-[10px] leading-tight bg-white border border-border/60">
                        <div className="truncate font-medium">{it.companyName}</div>
                        <div className="tabular-nums text-muted-foreground">{it.amount.toLocaleString("tr-TR")} {it.currencyCode}</div>
                        <Badge variant="outline" className="mt-0.5 h-4 px-1 text-[9px]">{it.type === "borc" ? "Tahsil" : "Ödeme"}</Badge>
                      </div>
                    ))}
                    {dayItems.length > 3 && <div className="text-[9px] text-muted-foreground">+{dayItems.length - 3} daha</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
