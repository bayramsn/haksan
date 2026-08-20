import { describe, expect, it } from "vitest";
import { requiresPaymentPlan } from "@haksan/shared";
import {
  PAYMENT_FAMILY_PLAN_SHAPE,
  familyOfMethod,
  missingPaymentInstrumentFields,
  methodOfFamily,
  paymentInstrumentNote,
  recalculatePaymentInstallment,
  paymentFamilyOptions,
  termKindOfMethod,
} from "./paymentMethod";

describe("ödeme yöntemi ailesi", () => {
  it("senet ve çeki vadenin türü olarak okur", () => {
    expect(familyOfMethod("promissory_note")).toBe("term");
    expect(familyOfMethod("cheque")).toBe("term");
    expect(familyOfMethod("term")).toBe("term");
    expect(termKindOfMethod("promissory_note")).toBe("senet");
    expect(termKindOfMethod("cheque")).toBe("cek");
    // Vadeli ama türü işaretlenmemiş kayıt elden ödemedir.
    expect(termKindOfMethod("term")).toBe("elden");
  });

  it("aile + vade türünü tek yöntem koduna eşler", () => {
    expect(methodOfFamily("term", "senet")).toBe("promissory_note");
    expect(methodOfFamily("term", "cek")).toBe("cheque");
    expect(methodOfFamily("term", "elden")).toBe("term");
    expect(methodOfFamily("cash", "senet")).toBe("cash");
    expect(methodOfFamily(null, "elden")).toBe("undecided");
  });

  it("yalnız Peşin/Leasing/Vadeli sunar, kayıttaki eski aileyi kaybetmez", () => {
    expect(paymentFamilyOptions(null)).toEqual(["cash", "leasing", "term"]);
    expect(paymentFamilyOptions("term")).toEqual(["cash", "leasing", "term"]);
    // Eski kayıt akreditif taşıyorsa seçim sessizce başka değere kaymamalı.
    expect(paymentFamilyOptions("letter_of_credit")).toContain("letter_of_credit");
  });

  it("peşin ve leasingde plan adımını atlar", () => {
    expect(PAYMENT_FAMILY_PLAN_SHAPE.cash).toBe("none");
    expect(PAYMENT_FAMILY_PLAN_SHAPE.leasing).toBe("none");
    // Ekranın atladığı adımı backend de zorunlu tutmamalı: iki taraf da
    // aynı `requiresPaymentPlan` kuralından besleniyor.
    expect(requiresPaymentPlan("cash")).toBe(false);
    expect(requiresPaymentPlan("leasing")).toBe(false);
    expect(requiresPaymentPlan("promissory_note")).toBe(true);
    expect(requiresPaymentPlan("cheque")).toBe(true);
    expect(requiresPaymentPlan("term")).toBe(true);
    // Yöntem seçilmeden adım "gerekmiyor" sayılırsa kart planı sessizce atlar.
    expect(requiresPaymentPlan("undecided")).toBe(true);
    expect(requiresPaymentPlan(null)).toBe(true);
  });

  it("senet ve çek için türe özgü bilgileri doğrular ve cari notu üretir", () => {
    const empty = { documentNo: "", issuer: "", bankName: "", branchName: "" };
    expect(missingPaymentInstrumentFields("term", empty)).toEqual([]);
    expect(missingPaymentInstrumentFields("promissory_note", empty)).toEqual([
      "senet numarası",
      "borçlu",
    ]);
    expect(missingPaymentInstrumentFields("cheque", empty)).toEqual([
      "çek numarası",
      "banka",
      "hesap sahibi",
    ]);

    expect(paymentInstrumentNote("promissory_note", {
      ...empty,
      documentNo: "SN-42",
      issuer: "Ada Makina",
    })).toBe("Senet No: SN-42 · Borçlu: Ada Makina");
    expect(paymentInstrumentNote("cheque", {
      documentNo: "CK-17",
      issuer: "Ada Makina",
      bankName: "Örnek Bank",
      branchName: "İkitelli",
    })).toBe("Çek No: CK-17 · Banka: Örnek Bank · Şube: İkitelli · Hesap Sahibi: Ada Makina");
  });

  it("tutar ve vade yeniden hesaplanırken senet/çek bilgilerini korur", () => {
    expect(recalculatePaymentInstallment({
      amount: 10,
      dueDate: "2026-09-01",
      documentNo: "CK-17",
      issuer: "Ada Makina",
      bankName: "Örnek Bank",
      branchName: "İkitelli",
    }, 25, "2026-10-01")).toEqual({
      amount: 25,
      dueDate: "2026-10-01",
      documentNo: "CK-17",
      issuer: "Ada Makina",
      bankName: "Örnek Bank",
      branchName: "İkitelli",
    });
  });
});
