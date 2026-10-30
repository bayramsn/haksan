import type { Customer, SalesCase } from "./mock";
import { matchesTr } from "./trSearch";

/** Firma adresi ve henüz firmaya dönüşmemiş fırsatın konumu aynı aramada yer alır. */
export function matchesOpportunitySearch(opportunity: SalesCase, company: Customer | undefined, query: string) {
  const search = query.trim();
  return [
    company?.name,
    company?.city,
    company?.district,
    company?.address,
    opportunity.leadCompanyTitle,
    opportunity.leadContactName,
    opportunity.leadContactValue,
    opportunity.leadPhone,
    opportunity.leadEmail,
    opportunity.leadCity,
    opportunity.leadDistrict,
    opportunity.externalMetadata?.candidate?.companyTitle,
    opportunity.requestedProduct,
    opportunity.lostProductName,
    opportunity.lostReason,
    opportunity.competitor,
    opportunity.lostCompetitorProductModel,
    opportunity.lostUnmetConditions,
  ].some((value) => matchesTr(value ?? "", search));
}
