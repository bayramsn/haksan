import type { DocumentItem, Offer, SalesCase } from "./mock";

type CompanyCase = Pick<SalesCase, "id" | "customerId">;

/**
 * Firma kartında doğrudan firma bağlantılı ve o firmanın satış kartından gelen
 * teklifleri tek listede toplar. İkinci koşul eski kayıtlarda companyId eksik
 * olsa bile fırsat üzerinden ilişkiyi korur.
 */
export const offersForCompany = (
  companyId: string,
  offers: readonly Offer[],
  salesCases: readonly CompanyCase[],
): Offer[] => {
  const companyCaseIds = new Set(
    salesCases.filter((salesCase) => salesCase.customerId === companyId).map((salesCase) => salesCase.id),
  );
  return offers.filter((offer) => offer.companyId
    ? offer.companyId === companyId
    : companyCaseIds.has(offer.salesCaseId));
};

/** Dış teklif dosyalarını firma, fırsat veya bağlı iç teklif üzerinden çözer. */
export const externalQuotesForCompany = (
  companyId: string,
  documents: readonly DocumentItem[],
  salesCases: readonly CompanyCase[],
  companyOffers: readonly Offer[],
): DocumentItem[] => {
  const companyCaseIds = new Set(
    salesCases.filter((salesCase) => salesCase.customerId === companyId).map((salesCase) => salesCase.id),
  );
  const companyOfferIds = new Set(companyOffers.map((offer) => offer.id));
  return documents.filter((document) => {
    if (document.type !== "ExternalQuote") return false;
    if (document.companyId) return document.companyId === companyId;
    if (document.quoteId) return companyOfferIds.has(document.quoteId);
    return companyCaseIds.has(document.salesCaseId);
  });
};
