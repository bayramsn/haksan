import { describe, expect, it } from "vitest";
import { requiresPaymentPlan } from "@haksan/shared";
import {
  PAYMENT_FAMILY_PLAN_SHAPE,
  familyOfMethod,
  methodOfFamily,
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
});
