import { useEffect, useMemo, useState } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { opportunityService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import type { SalesCase } from "../../lib/mock";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export function OpportunityStockPickerDialog({
  open,
  onOpenChange,
  salesCase,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesCase: SalesCase;
  onCompleted: () => Promise<unknown> | unknown;
}) {
  const { stock, customers } = useStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const company = customers.find((item) => item.id === salesCase.customerId);
  const candidates = useMemo(
    () =>
      stock.filter(
        (item) =>
          item.status === "Available" ||
          (item.status === "Reserved" &&
            Boolean(salesCase.customerId) &&
            item.reservedCompanyId === salesCase.customerId)
      ),
    [salesCase.customerId, stock]
  );

  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  const save = async () => {
    if (!selectedIds.length || saving) return;
    setSaving(true);
    try {
      await opportunityService.changeStage(salesCase.id, {
        toStage: "stock_picking",
        inventoryItemIds: selectedIds,
      });
      await onCompleted();
      onOpenChange(false);
      toast.success("Seri numarası rezerve edildi");
    } catch (error: any) {
      toast.error("Stok seçimi tamamlanamadı", {
        description: error?.message ?? "Seçilen stok kalemlerini kontrol edin.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="size-5 text-primary" /> Stok ve seri numarası seçimi
          </DialogTitle>
          <DialogDescription>
            {company?.name ?? "Bağlı firma"} için rezerve edilecek seri numaralarını seçin.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/70">
          {candidates.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 border-b border-border/60 p-3 last:border-b-0 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    setSelectedIds((current) =>
                      next === true
                        ? current.includes(item.id)
                          ? current
                          : [...current, item.id]
                        : current.filter((id) => id !== item.id)
                    )
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {item.serialNumber || item.stockCode || item.id.slice(0, 8)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[item.brand, item.counterModel || item.counterType, item.warehouse].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
          {!candidates.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Uygun veya bu firmaya rezerve edilmiş stok bulunamadı.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="button" disabled={!selectedIds.length || saving} onClick={() => void save()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Rezerve ediliyor…" : `${selectedIds.length} seri noyu rezerve et`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
