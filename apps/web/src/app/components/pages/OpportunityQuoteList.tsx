import { ChevronRight, FileText } from "lucide-react";
import type { Offer } from "../../lib/mock";
import { StatusBadge } from "../shared/StatusBadge";

export const sortOpportunityOffers = (offers: Offer[]) =>
  offers.slice().sort((left, right) => {
    const revisionDifference = right.revision - left.revision;
    if (revisionDifference !== 0) return revisionDifference;
    return right.date.localeCompare(left.date);
  });

/**
 * B alanındaki tamamlanmış teklif görevini kanıta dönüştürür: kullanıcı yalnız
 * bir tik görmek yerine fırsata bağlı bütün teklifleri ve son durumlarını görür.
 */
export function OpportunityQuoteList({
  offers,
  onOpenOffer,
}: {
  offers: Offer[];
  onOpenOffer?: (offerId: string) => void;
}) {
  const sortedOffers = sortOpportunityOffers(offers);

  if (sortedOffers.length === 0) return null;

  return (
    <div className="border-t border-border/60 bg-muted/15 px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Fırsata bağlı teklifler · {sortedOffers.length}
        </span>
        <span className="text-[10px] text-muted-foreground">Detay için teklifi seçin</span>
      </div>
      <ul aria-label="Fırsata bağlı teklifler" className="grid gap-1.5">
        {sortedOffers.map((offer) => (
          <li key={offer.id}>
            <button
              type="button"
              disabled={!onOpenOffer}
              aria-label={`${offer.quoteNo}, revizyon ${offer.revision}, ${offer.amount.toLocaleString("tr-TR")} ${offer.currency} teklifini görüntüle`}
              onClick={() => onOpenOffer?.(offer.id)}
              className="group grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-2 text-left shadow-xs transition-[border-color,background-color,box-shadow,transform] hover:border-primary/30 hover:bg-primary/[0.025] hover:shadow-sm active:translate-y-px disabled:cursor-default disabled:opacity-80 disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="grid size-8 place-items-center rounded-md bg-primary/8 text-primary" aria-hidden="true">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="truncate text-xs font-semibold text-foreground">{offer.quoteNo}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">R{offer.revision}</span>
                </span>
                <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                  {offer.date} · <b className="font-semibold text-foreground">{offer.amount.toLocaleString("tr-TR")} {offer.currency}</b>
                </span>
              </span>
              <StatusBadge status={offer.status} />
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
