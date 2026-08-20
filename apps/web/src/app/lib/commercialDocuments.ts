import type { DocumentItem, Offer } from "./mock";

export type CommercialDocumentStepKey = "quote" | "proforma" | "contract" | "invoice";
export type CommercialDocumentStepState = "ready" | "missing" | "blocked";

export type CommercialDocumentStep = {
  key: CommercialDocumentStepKey;
  label: string;
  state: CommercialDocumentStepState;
  count: number;
  itemId?: string;
  quoteId?: string;
  primary: string;
  source?: string;
};

export type CommercialDocumentChain = {
  steps: CommercialDocumentStep[];
  latestOffer?: Offer;
  readyCount: number;
};

const DOCUMENT_STEP_TYPES: Record<Exclude<CommercialDocumentStepKey, "quote">, DocumentItem["type"]> = {
  proforma: "Proforma",
  contract: "Contract",
  invoice: "CommercialInvoice",
};

const STEP_LABELS: Record<CommercialDocumentStepKey, string> = {
  quote: "Teklif",
  proforma: "Proforma",
  contract: "Sözleşme",
  invoice: "Ticari fatura",
};

const timestamp = (value?: string) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const offerOrder = (left: Offer, right: Offer) =>
  right.revision - left.revision || timestamp(right.date) - timestamp(left.date);

const documentOrder = (latestOfferId?: string) => (left: DocumentItem, right: DocumentItem) => {
  const leftLatest = Number(Boolean(latestOfferId && left.quoteId === latestOfferId));
  const rightLatest = Number(Boolean(latestOfferId && right.quoteId === latestOfferId));
  return rightLatest - leftLatest || timestamp(right.uploadedAt) - timestamp(left.uploadedAt);
};

/**
 * Teklif ve ticari PDF kayıtlarını tek bir izlenebilir zincire indirger.
 * Belge seçiminde önce son teklif revizyonuna doğrudan bağlı kayıt, ardından
 * en yeni kayıt tercih edilir; böylece eski revizyon PDF'leri görünmez olmaz.
 */
export function buildCommercialDocumentChain(
  offers: Offer[],
  documents: DocumentItem[],
): CommercialDocumentChain {
  const sortedOffers = offers.slice().sort(offerOrder);
  const latestOffer = sortedOffers[0];
  const quoteStep: CommercialDocumentStep = latestOffer
    ? {
        key: "quote",
        label: STEP_LABELS.quote,
        state: "ready",
        count: sortedOffers.length,
        itemId: latestOffer.id,
        quoteId: latestOffer.id,
        primary: `${latestOffer.quoteNo} · R${latestOffer.revision}`,
        source: sortedOffers.length > 1 ? `${sortedOffers.length} revizyon` : "Ana ticari kaynak",
      }
    : {
        key: "quote",
        label: STEP_LABELS.quote,
        state: "missing",
        count: 0,
        primary: "Henüz oluşturulmadı",
      };

  const documentSteps = (Object.keys(DOCUMENT_STEP_TYPES) as Array<Exclude<CommercialDocumentStepKey, "quote">>)
    .map((key): CommercialDocumentStep => {
      const matching = documents
        .filter((document) => document.type === DOCUMENT_STEP_TYPES[key])
        .sort(documentOrder(latestOffer?.id));
      const document = matching[0];
      if (!document) {
        return {
          key,
          label: STEP_LABELS[key],
          state: latestOffer ? "missing" : "blocked",
          count: 0,
          primary: latestOffer ? "Oluşturulmayı bekliyor" : "Önce teklif gerekli",
        };
      }
      const sourceOffer = sortedOffers.find((offer) => offer.id === document.quoteId);
      return {
        key,
        label: STEP_LABELS[key],
        state: "ready",
        count: matching.length,
        itemId: document.id,
        quoteId: document.quoteId,
        primary: document.fileName,
        source: sourceOffer
          ? `${sourceOffer.quoteNo} · R${sourceOffer.revision} bağlantılı`
          : document.quoteId
            ? "Bağlı teklif arşivde"
            : "Satış kartına bağlı",
      };
    });

  const steps = [quoteStep, ...documentSteps];
  return {
    steps,
    latestOffer,
    readyCount: steps.filter((step) => step.state === "ready").length,
  };
}
