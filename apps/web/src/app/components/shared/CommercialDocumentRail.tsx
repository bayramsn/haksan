import type { ReactNode } from "react";
import {
  Check,
  FileCheck2,
  FileSignature,
  FileText,
  Link2,
  LockKeyhole,
  ReceiptText,
} from "lucide-react";
import type { DocumentItem, Offer } from "../../lib/mock";
import {
  buildCommercialDocumentChain,
  type CommercialDocumentStepKey,
} from "../../lib/commercialDocuments";
import { cn } from "../ui/utils";

const STEP_ICONS: Record<CommercialDocumentStepKey, typeof FileText> = {
  quote: FileText,
  proforma: FileCheck2,
  contract: FileSignature,
  invoice: ReceiptText,
};

const STATE_STYLE = {
  ready: {
    node: "border-emerald-200 bg-emerald-50 text-emerald-700",
    card: "border-emerald-200/80 bg-emerald-50/45",
    status: "Hazır",
  },
  missing: {
    node: "border-amber-200 bg-amber-50 text-amber-700",
    card: "border-amber-200/80 bg-amber-50/35",
    status: "Bekliyor",
  },
  blocked: {
    node: "border-slate-200 bg-slate-100 text-slate-400",
    card: "border-slate-200 bg-slate-50/70",
    status: "Kilitli",
  },
} as const;

export function CommercialDocumentRail({
  offers,
  documents,
  variant = "workspace",
  actions,
  onOpenOffer,
  onOpenDocument,
  className,
  showStepActions = true,
}: {
  offers: Offer[];
  documents: DocumentItem[];
  variant?: "compact" | "workspace";
  actions?: Partial<Record<CommercialDocumentStepKey, ReactNode>>;
  onOpenOffer?: (offer: Offer) => void;
  onOpenDocument?: (document: DocumentItem) => void;
  className?: string;
  showStepActions?: boolean;
}) {
  const chain = buildCommercialDocumentChain(offers, documents);
  const isCompact = variant === "compact";
  const openStep = (key: CommercialDocumentStepKey, itemId?: string) => {
    if (!itemId) return;
    if (key === "quote") {
      const offer = offers.find((candidate) => candidate.id === itemId);
      if (offer) onOpenOffer?.(offer);
      return;
    }
    const document = documents.find((candidate) => candidate.id === itemId);
    if (document) onOpenDocument?.(document);
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[#0b2453]/15 bg-white",
        isCompact ? "p-2.5" : "shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className,
      )}
      aria-label="Ticari belge zinciri"
    >
      <div className={cn("flex items-start justify-between gap-3", !isCompact && "border-b border-slate-100 px-4 py-3.5 sm:px-5")}>
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-[#536178]">
            <Link2 className="size-3" aria-hidden="true" /> Ticari belge zinciri
          </div>
          {!isCompact && (
            <p className="mt-1 text-xs text-muted-foreground">
              Teklif revizyonundan faturaya kadar her PDF aynı satış kartı ve kaynak teklifle izlenir.
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-[#eaf0f8] px-2 py-1 font-data text-[9px] font-semibold tabular-nums text-[#163b75]">
          {chain.readyCount}/4 hazır
        </span>
      </div>

      <div className={cn("relative grid grid-cols-4", isCompact ? "mt-2 gap-1" : "gap-2 px-3 py-4 sm:gap-3 sm:px-5")}>
        <div
          className={cn(
            "pointer-events-none absolute h-px bg-slate-200",
            isCompact ? "left-[12%] right-[12%] top-[19px]" : "left-[13%] right-[13%] top-[43px]",
          )}
          aria-hidden="true"
        />
        {chain.steps.map((step) => {
          const Icon = STEP_ICONS[step.key];
          const style = STATE_STYLE[step.state];
          const canOpen = step.state === "ready" && Boolean(step.itemId) && (
            step.key === "quote" ? Boolean(onOpenOffer) : Boolean(onOpenDocument)
          );
          const action = showStepActions && step.state !== "ready" ? actions?.[step.key] : null;
          return (
            <div key={step.key} className="relative z-10 min-w-0 text-center">
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => openStep(step.key, step.itemId)}
                className={cn(
                  "group w-full min-w-0 rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-[#2457D6] focus-visible:ring-offset-2",
                  isCompact ? "px-0.5" : cn("border px-2 py-3 text-left", style.card),
                  canOpen && "cursor-pointer hover:-translate-y-px hover:border-[#2457D6]/40 hover:shadow-sm",
                  !canOpen && "cursor-default",
                )}
                aria-label={`${step.label}: ${step.primary}`}
              >
                <span
                  className={cn(
                    "mx-auto grid shrink-0 place-items-center rounded-full border-2 ring-4 ring-white",
                    isCompact ? "size-9" : "size-10",
                    style.node,
                  )}
                >
                  {step.state === "ready" ? <Check className="size-4" /> : step.state === "blocked" ? <LockKeyhole className="size-3.5" /> : <Icon className="size-4" />}
                </span>
                <span className={cn("mt-1.5 block truncate font-semibold text-[#0b1739]", isCompact ? "text-[9px]" : "text-xs")}>
                  {step.label}
                </span>
                <span className={cn("mt-0.5 block truncate text-muted-foreground", isCompact ? "text-[8px]" : "text-[10px]")} title={step.primary}>
                  {step.primary}
                </span>
                {!isCompact && (
                  <span className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-[9px] text-muted-foreground">
                    <span className="truncate" title={step.source}>{step.source ?? style.status}</span>
                    {step.count > 1 && <span className="shrink-0 font-data tabular-nums">×{step.count}</span>}
                  </span>
                )}
              </button>
              {action && <div className={cn("flex justify-center", isCompact ? "mt-1" : "mt-2")}>{action}</div>}
            </div>
          );
        })}
      </div>

      {!isCompact && chain.latestOffer && (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[10px] text-muted-foreground sm:px-5">
          <Link2 className="size-3.5 shrink-0 text-[#2457D6]" />
          <span className="truncate">
            Aktif kaynak: <b className="font-semibold text-[#0b1739]">{chain.latestOffer.quoteNo} · R{chain.latestOffer.revision}</b>
          </span>
        </div>
      )}
    </section>
  );
}
