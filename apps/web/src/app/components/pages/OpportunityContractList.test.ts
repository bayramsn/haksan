import { describe, expect, it } from "vitest";
import type { DocumentItem } from "../../lib/mock";
import { signedContractFileError } from "../dialogs/ContractActionsDialogs";
import { sortOpportunityContracts } from "./OpportunityContractList";

const contract = (patch: Partial<DocumentItem>): DocumentItem => ({
  id: "contract-1",
  salesCaseId: "opp-1",
  type: "Contract",
  fileName: "CNC-SOZ-2026/001",
  uploadedBy: "",
  uploadedAt: "2026-08-01",
  size: "Kayıt",
  ...patch,
});

describe("fırsata bağlı sözleşme listesi", () => {
  it("en yeni sözleşmeyi başa alır", () => {
    const sorted = sortOpportunityContracts([
      contract({ id: "eski", uploadedAt: "2026-07-01" }),
      contract({ id: "yeni", uploadedAt: "2026-08-19" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["yeni", "eski"]);
  });

  it("kaynağı değiştirmeden yeni dizi döndürür", () => {
    const source = [contract({ id: "a", uploadedAt: "2026-07-01" }), contract({ id: "b", uploadedAt: "2026-08-01" })];
    sortOpportunityContracts(source);
    expect(source.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("imzalı sözleşme dosyası doğrulaması", () => {
  it("PDF olmayanı reddeder", () => {
    expect(signedContractFileError({ name: "sozlesme.docx", type: "application/msword", size: 1000 }))
      .toBe("İmzalı sözleşme PDF formatında olmalıdır");
  });

  it("uzantıdan PDF'i kabul eder (tarayıcı MIME vermeyebilir)", () => {
    expect(signedContractFileError({ name: "SOZLESME.PDF", type: "", size: 1000 })).toBeNull();
  });

  it("25 MB üstünü reddeder", () => {
    expect(signedContractFileError({ name: "a.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }))
      .toBe("Dosya boyutu 25 MB'ı aşamaz");
    expect(signedContractFileError({ name: "a.pdf", type: "application/pdf", size: 25 * 1024 * 1024 })).toBeNull();
  });
});
