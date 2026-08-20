import { describe, expect, it } from "vitest";
import type { DocumentItem, Offer, SalesCase } from "./mock";
import { externalQuotesForCompany, offersForCompany } from "./customerOfferRelations";

const offer = (id: string, salesCaseId: string, companyId?: string) => ({
  id,
  salesCaseId,
  companyId,
}) as Offer;

const salesCase = (id: string, customerId: string) => ({ id, customerId }) as SalesCase;

const document = (
  id: string,
  type: DocumentItem["type"],
  values: Partial<DocumentItem> = {},
) => ({ id, type, salesCaseId: "", fileName: `${id}.pdf`, uploadedBy: "Test", uploadedAt: "2026-08-13", size: "1 KB", ...values }) as DocumentItem;

describe("company offer relations", () => {
  it("includes direct, opportunity-linked and standalone offers for the company", () => {
    const cases = [salesCase("case-a", "company-a"), salesCase("case-b", "company-b")];
    const offers = [
      offer("direct", "", "company-a"),
      offer("legacy-via-case", "case-a"),
      offer("canonical-other-company", "case-a", "company-b"),
      offer("other-company", "case-b", "company-b"),
    ];

    expect(offersForCompany("company-a", offers, cases).map((item) => item.id)).toEqual([
      "direct",
      "legacy-via-case",
    ]);
  });

  it("includes only external quote files related to the company", () => {
    const cases = [salesCase("case-a", "company-a"), salesCase("case-b", "company-b")];
    const companyOffers = [offer("quote-a", "case-a", "company-a")];
    const documents = [
      document("by-company", "ExternalQuote", { companyId: "company-a" }),
      document("by-case", "ExternalQuote", { salesCaseId: "case-a" }),
      document("by-quote", "ExternalQuote", { quoteId: "quote-a" }),
      document("not-an-offer", "Other", { companyId: "company-a" }),
      document("canonical-other-company", "ExternalQuote", { salesCaseId: "case-a", companyId: "company-b" }),
      document("other-company", "ExternalQuote", { salesCaseId: "case-b", companyId: "company-b" }),
    ];

    expect(externalQuotesForCompany("company-a", documents, cases, companyOffers).map((item) => item.id)).toEqual([
      "by-company",
      "by-case",
      "by-quote",
    ]);
  });
});
