import { describe, expect, it } from "vitest";
import {
  buildDocumentFilename,
  contractFilename,
  divisionShortCode,
  proformaFilename,
  quoteFilename,
  shortCompanyToken,
  shortMachineToken,
} from "./filename";
import type { ContractPrintData, ProformaPrintData, QuotePrintData } from "./templates";

describe("divisionShortCode", () => {
  it("maps every division spelling to the API document-series code", () => {
    expect(divisionShortCode("cnc")).toBe("CNC");
    expect(divisionShortCode("CNC")).toBe("CNC");
    expect(divisionShortCode("universal")).toBe("UNI");
    expect(divisionShortCode("Üniversal")).toBe("UNI");
    expect(divisionShortCode("UNI")).toBe("UNI");
    expect(divisionShortCode("sac_isleme")).toBe("SACISLE");
    expect(divisionShortCode("Sac İşleme")).toBe("SACISLE");
    expect(divisionShortCode("SACISLE")).toBe("SACISLE");
  });

  it("keeps unknown divisions instead of dropping them", () => {
    expect(divisionShortCode("Robotik")).toBe("ROBOTIK");
    expect(divisionShortCode("Çok Uzun Bölüm Adı")).toBe("COKUZUNB");
  });

  it("returns an empty code for missing values", () => {
    expect(divisionShortCode(undefined)).toBe("");
    expect(divisionShortCode(null)).toBe("");
    expect(divisionShortCode("  ")).toBe("");
  });
});

describe("shortCompanyToken", () => {
  it("transliterates Turkish letters and strips trailing legal-form tokens", () => {
    expect(shortCompanyToken("BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ."))
      .toBe("BARTIN-OTOMOTIV-PAZARLAMA");
    expect(shortCompanyToken("ÖRNEK MAKİNE SAN. ve TİC. LTD. ŞTİ.")).toBe("ORNEK-MAKINE");
    expect(shortCompanyToken("ÇOKLU MAKİNE A.Ş.")).toBe("COKLU-MAKINE");
    expect(shortCompanyToken("ZORKAYA MAKİNE METAL SAN. ve TİC. LTD. ŞTİ."))
      .toBe("ZORKAYA-MAKINE-METAL");
  });

  it("never strips a company down to nothing", () => {
    expect(shortCompanyToken("A.Ş.")).toBe("A");
    expect(shortCompanyToken("Ltd")).toBe("Ltd");
  });

  it("keeps leading single letters that are part of the name", () => {
    expect(shortCompanyToken("A PLUS MAKİNA")).toBe("A-PLUS-MAKINA");
  });

  it("returns an empty token for missing values", () => {
    expect(shortCompanyToken(undefined)).toBe("");
    expect(shortCompanyToken(null)).toBe("");
    expect(shortCompanyToken("   ")).toBe("");
  });
});

describe("shortMachineToken", () => {
  it("takes only the first machine when several are joined", () => {
    expect(shortMachineToken("ECOCA MT-208 CNC Torna / LK VM-2 CNC Dik İşleme Merkezi"))
      .toBe("ECOCA-MT-208-CNC-Torna");
  });

  it("does not split a model that contains a slash", () => {
    expect(shortMachineToken("HAKSAN MT-210/1000")).toBe("HAKSAN-MT-210-1000");
  });

  it("caps very long machine labels at a word boundary", () => {
    const token = shortMachineToken("LK MACHINERY VC-1000 Cnc Dik İşleme Merkezi Tam Donanımlı Paket");
    expect(token.length).toBeLessThanOrEqual(40);
    expect(token).toBe("LK-MACHINERY-VC-1000-Cnc-Dik-Isleme");
  });
});

describe("buildDocumentFilename", () => {
  it("builds type + division-prefixed number + company + machine", () => {
    expect(buildDocumentFilename({
      kind: "proforma",
      documentNo: "CNC-PRF-2026/005",
      company: "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ.",
      machine: "L.K. MACHINERY VM-2",
      division: "cnc",
    })).toBe("Proforma_CNC-PRF-2026-005_BARTIN-OTOMOTIV-PAZARLAMA_L-K-MACHINERY-VM-2");
  });

  it("prepends the division code when the number has no series prefix", () => {
    expect(buildDocumentFilename({
      kind: "quote",
      documentNo: "2026/001",
      company: "Örnek Makine",
      division: "Sac İşleme",
    })).toBe("Teklif_SACISLE-2026-001_Ornek-Makine");
  });

  it("trusts the series prefix already on the number over a conflicting division", () => {
    expect(buildDocumentFilename({
      kind: "contract",
      documentNo: "CNC-SOZ-2026/010",
      division: "universal",
    })).toBe("Sozlesme_CNC-SOZ-2026-010");
  });

  // Eksik veri: hiçbir parça zorunlu değil, ad hiçbir zaman çökmemeli/boş kalmamalı.
  it("skips the company segment when the company is missing", () => {
    expect(buildDocumentFilename({
      kind: "proforma",
      documentNo: "UNI-PRF-2026/007",
      machine: "HAKSAN UF-560",
    })).toBe("Proforma_UNI-PRF-2026-007_HAKSAN-UF-560");
  });

  it("skips the machine segment when the machine is missing", () => {
    expect(buildDocumentFilename({
      kind: "contract",
      documentNo: "SACISLE-SOZ-2026/001",
      company: "Demir Sac",
    })).toBe("Sozlesme_SACISLE-SOZ-2026-001_Demir-Sac");
  });

  it("falls back to the division code alone when there is no document number", () => {
    expect(buildDocumentFilename({ kind: "quote", division: "cnc", company: "Örnek" }))
      .toBe("Teklif_CNC_Ornek");
  });

  it("degrades to the bare document type when everything is missing", () => {
    expect(buildDocumentFilename({ kind: "proforma" })).toBe("Proforma");
    expect(buildDocumentFilename({ kind: "quote", documentNo: null, company: null, machine: null, division: null }))
      .toBe("Teklif");
    expect(buildDocumentFilename({ kind: "contract", documentNo: "  ", company: "", machine: "—" }))
      .toBe("Sozlesme");
  });

  it("strips filesystem-hostile characters instead of leaking them into the name", () => {
    const filename = buildDocumentFilename({
      kind: "proforma",
      documentNo: 'CNC-PRF-2026/005',
      company: 'A/B\\C:D*E?F"G<H>I|J',
      machine: "Model\u0007X",
    });
    expect(filename).toBe("Proforma_CNC-PRF-2026-005_A-B-C-D_Model-X");
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    // eslint-disable-next-line no-control-regex
    expect(filename).not.toMatch(/[\u0000-\u001f]/);
  });

  it("keeps the whole name ASCII and within a sane length", () => {
    const filename = buildDocumentFilename({
      kind: "contract",
      documentNo: "SACISLE-SOZ-2026/001",
      company: "ÇİĞDEM ÖZGÜR ŞAHİN İNŞAAT TAAHHÜT",
      machine: "ADIRA QIH-320 Hidrolik Abkant Pres Tam Donanım",
    });
    expect(filename).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(filename.length).toBeLessThanOrEqual(120);
    expect(filename).toBe("Sozlesme_SACISLE-SOZ-2026-001_CIGDEM-OZGUR-SAHIN-INSAAT_ADIRA-QIH-320-Hidrolik-Abkant-Pres-Tam");
  });
});

describe("print-data filename helpers", () => {
  const quoteData = {
    firma: "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ.",
    tarih: "25 Şubat 2026",
    belgeNo: "CNC-2026/001",
    marka: "L.K. MACHINERY",
    model: "VM-2",
    items: [],
    kdvOran: 20,
    kdvTutar: 0,
    currency: "USD",
    notes: {} as QuotePrintData["notes"],
  } satisfies QuotePrintData;

  const proformaData = {
    firma: "ÇOKLU MAKİNE A.Ş.",
    tarih: "25 Şubat 2026",
    belgeNo: "UNI-PRF-2026/013",
    items: [{ aciklama: "HAKSAN UF-560 Üniversal Freze", birim: "1 Adet", tutar: 17_200 }],
    kdvOran: 20,
    kdvTutar: 0,
    currency: "USD",
    notlar: [],
  } satisfies ProformaPrintData;

  const contractData = {
    alici: { unvan: "ZORKAYA MAKİNE METAL SAN. ve TİC. LTD. ŞTİ." },
    sozlesmeNo: "CNC-SOZ-2024/001",
    sozlesmeTarihi: "2024-01-19",
    model: "LK MACHINERY VC-1000 Cnc İşleme Merkezi",
    adet: 1,
    ozellikler: [],
    aksesuarlar: [],
    fiyat: 64_400,
    currency: "USD",
    kdvOran: 20,
    odemePlani: [],
  } satisfies ContractPrintData;

  it("derives the quote filename from brand + model", () => {
    expect(quoteFilename(quoteData, { division: "CNC" }))
      .toBe("Teklif_CNC-2026-001_BARTIN-OTOMOTIV-PAZARLAMA_L-K-MACHINERY-VM-2");
  });

  it("derives the proforma filename from the first item", () => {
    expect(proformaFilename(proformaData))
      .toBe("Proforma_UNI-PRF-2026-013_COKLU-MAKINE_HAKSAN-UF-560-Universal-Freze");
  });

  it("derives the contract filename from the first machine", () => {
    expect(contractFilename(contractData))
      .toBe("Sozlesme_CNC-SOZ-2024-001_ZORKAYA-MAKINE-METAL_LK-MACHINERY-VC-1000-Cnc-Isleme-Merkezi");
  });

  it("uses the free-text company of a quick proforma when no company is on file", () => {
    expect(proformaFilename({ ...proformaData, firma: "" }, { company: "Kayıtsız Müşteri Ltd. Şti." }))
      .toBe("Proforma_UNI-PRF-2026-013_Kayitsiz-Musteri_HAKSAN-UF-560-Universal-Freze");
  });

  it("survives print data with no company, machine or division", () => {
    expect(proformaFilename({ ...proformaData, firma: "", items: [] }))
      .toBe("Proforma_UNI-PRF-2026-013");
    expect(contractFilename({ ...contractData, alici: { unvan: "" }, model: "", machines: [] }))
      .toBe("Sozlesme_CNC-SOZ-2024-001");
  });
});
