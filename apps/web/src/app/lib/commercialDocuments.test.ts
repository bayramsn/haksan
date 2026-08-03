import { describe, expect, it } from "vitest";
import { buildCommercialDocumentChain } from "./commercialDocuments";
import type { DocumentItem, Offer } from "./mock";

const offer = (id: string, revision: number): Offer => ({
  id,
  salesCaseId: "case-1",
  quoteNo: "TKL-2026-0042",
  revision,
  date: `2026-07-${20 + revision}`,
  amount: 100_000,
  currency: "EUR",
  status: "Sent",
  note: "",
});

const document = (id: string, type: DocumentItem["type"], quoteId?: string): DocumentItem => ({
  id,
  salesCaseId: "case-1",
  quoteId,
  type,
  fileName: `${id}.pdf`,
  uploadedBy: "user-1",
  uploadedAt: "2026-07-30T10:00:00.000Z",
  size: "120 KB",
  fileId: `file-${id}`,
});

describe("buildCommercialDocumentChain", () => {
  it("en yeni teklif revizyonunu kaynak seçer ve ona bağlı PDF'yi öne alır", () => {
    const chain = buildCommercialDocumentChain(
      [offer("quote-r1", 1), offer("quote-r2", 2)],
      [
        document("proforma-r1", "Proforma", "quote-r1"),
        document("proforma-r2", "Proforma", "quote-r2"),
      ],
    );

    expect(chain.latestOffer?.id).toBe("quote-r2");
    expect(chain.steps[0].primary).toBe("TKL-2026-0042 · R2");
    expect(chain.steps[1]).toMatchObject({ itemId: "proforma-r2", count: 2, state: "ready" });
  });

  it("teklif yokken sonraki belgeleri kilitli, teklif varken eksik gösterir", () => {
    expect(buildCommercialDocumentChain([], []).steps.map((step) => step.state)).toEqual([
      "missing",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(buildCommercialDocumentChain([offer("quote-r1", 1)], []).steps.map((step) => step.state)).toEqual([
      "ready",
      "missing",
      "missing",
      "missing",
    ]);
  });

  it("karttaki mevcut ticari belge kayıtlarının tamamını hazır sayar", () => {
    const chain = buildCommercialDocumentChain([offer("quote-r1", 1)], [
      document("proforma", "Proforma", "quote-r1"),
      document("contract", "Contract", "quote-r1"),
      document("invoice", "CommercialInvoice", "quote-r1"),
    ]);

    expect(chain.readyCount).toBe(4);
    expect(chain.steps.every((step) => step.state === "ready")).toBe(true);
  });
});
