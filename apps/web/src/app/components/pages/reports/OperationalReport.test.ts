import { describe, expect, it } from "vitest";
import { operationalPrintDoc } from "./OperationalReport";

describe("operationalPrintDoc", () => {
  it("lays out the rows, totals and scope in the print document", () => {
    const rows = [
      { bucket: "2026-01", quotes: 3, approved: 1, rejected: 0, won: 1, lost: 0, service: 2, revenueUsd: 75130 },
      { bucket: "2026-02", quotes: 0, approved: 0, rejected: 1, won: 0, lost: 2, service: 0, revenueUsd: 0 },
    ];
    const doc = operationalPrintDoc({
      rows,
      totals: { quotes: 3, approved: 1, rejected: 1, won: 1, lost: 2, service: 2, revenueUsd: 75130 },
      period: "monthly",
      year: 2026,
      conversion: 33,
      ownerName: "Ayşe <Demir>",
      departmentName: null,
      rateNote: "Ciro USD bazında; kur tarihi 2026-09-16.",
      assetBase: "/print",
    });

    expect(doc.title).toBe("Operasyonel Rapor · 2026 · aylık");
    expect(doc.body).toContain("<b>Oca</b>");
    expect(doc.body).toContain("<b>Şub</b>");
    expect(doc.body).toContain("Temsilci: Ayşe &lt;Demir&gt;");
    expect(doc.body).toContain("$ 75.130");
    expect(doc.body).toContain("%33");
    expect(doc.body).toContain("kur tarihi 2026-09-16");
    // Yıllık kırılımda ay etiketi değil yıl basılır.
    const yearly = operationalPrintDoc({
      rows: [{ bucket: "2025", quotes: 1, approved: 0, rejected: 0, won: 0, lost: 0, service: 0, revenueUsd: 0 }],
      totals: { quotes: 1, approved: 0, rejected: 0, won: 0, lost: 0, service: 0, revenueUsd: 0 },
      period: "yearly",
      year: 2026,
      conversion: 0,
      ownerName: null,
      departmentName: null,
      rateNote: "",
      assetBase: "/print",
    });
    expect(yearly.body).toContain("<b>2025</b>");
    expect(yearly.body).toContain("Tüm ekip");
  });
});
