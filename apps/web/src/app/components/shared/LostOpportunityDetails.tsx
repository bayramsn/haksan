import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import type { SalesCase } from "../../lib/mock";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

const lostProduct = (salesCase: SalesCase) =>
  salesCase.lostProductName ||
  salesCase.requestedMachine ||
  [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" · ") ||
  "Belirtilmedi";

export const lostReasonText = (salesCase: SalesCase) =>
  salesCase.lostReason || salesCase.lostReasonCode || "Belirtilmedi";

export const lostTimelineDetail = (salesCase: SalesCase) =>
  [
    `Kayıp nedeni: ${lostReasonText(salesCase)}`,
    `Kaybedilen ürün: ${lostProduct(salesCase)}`,
    `Rakip: ${[salesCase.competitor, salesCase.lostCompetitorProductModel].filter(Boolean).join(" · ") || "yok / bilinmiyor"}`,
    `Uymayan şartlar: ${salesCase.lostUnmetConditions || salesCase.qualificationNote || "Belirtilmedi"}`,
  ].join("\n");

export function LostOpportunityDetails({
  salesCase,
  companyName,
  compact = false,
}: {
  salesCase: SalesCase;
  companyName?: string;
  compact?: boolean;
}) {
  const rows = [
    ["Firma", salesCase.lostCompanyName || companyName || "Belirtilmedi"],
    ["Kaybedilen ürün", lostProduct(salesCase)],
    ["Kayıp nedeni", lostReasonText(salesCase)],
    ["Rakip", [salesCase.competitor, salesCase.lostCompetitorProductModel].filter(Boolean).join(" · ") || "Rakip yok / bilinmiyor"],
    ["Uymayan şartlarımız", salesCase.lostUnmetConditions || salesCase.qualificationNote || "Belirtilmedi"],
  ];

  return (
    <section className={`rounded-lg border border-destructive/20 bg-destructive-soft/35 ${compact ? "p-3" : "p-4"}`} aria-label="Kaybedilme ayrıntıları">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Kaybedilme Detayı</div>
      <dl className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2"}>
        {rows.map(([label, value], index) => (
          <div key={label} className={!compact && index === rows.length - 1 ? "sm:col-span-2" : undefined}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium leading-5 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LostOpportunityDetailsDialog({
  salesCase,
  companyName,
  trigger,
}: {
  salesCase: SalesCase;
  companyName?: string;
  trigger?: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Eye className="size-3.5" /> Ayrıntıyı Oku
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Kaybedilen fırsat ayrıntısı</DialogTitle>
          <DialogDescription>Kayıp nedeni, ürün, rakip ve uymayan şartların tam kaydı.</DialogDescription>
        </DialogHeader>
        <LostOpportunityDetails salesCase={salesCase} companyName={companyName} />
      </DialogContent>
    </Dialog>
  );
}
