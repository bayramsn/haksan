import { describe, expect, it } from "vitest";
import { auditDetail, auditSide, auditValue } from "./opportunityAudit";

describe("auditValue sır maskeleme", () => {
  it("hassas alan adlarını değere bakmadan maskeler", () => {
    for (const key of ["password", "passwordHash", "apiToken", "refreshToken", "clientSecret", "secret", "hash"]) {
      expect(auditValue(key, "sk_live_abc123"), key).toBe("••••••");
    }
  });

  it("büyük/küçük harf ve gömülü eşleşmelerde de maskeler", () => {
    expect(auditValue("PASSWORD", "x")).toBe("••••••");
    expect(auditValue("userPasswordResetToken", "x")).toBe("••••••");
    expect(auditValue("Secret_Key", "x")).toBe("••••••");
  });

  it("maskeleme boş değer kontrolünden önce gelir", () => {
    // Sıra bozulursa hassas alanlar "Boş" diye sızabilir hale gelir.
    expect(auditValue("token", "")).toBe("••••••");
    expect(auditValue("token", null)).toBe("••••••");
  });

  it("hassas olmayan alanları olduğu gibi biçimlendirir", () => {
    expect(auditValue("probability", 70)).toBe("70");
    expect(auditValue("nextAction", "")).toBe("Boş");
    expect(auditValue("isActive", true)).toBe("Evet");
    expect(auditValue("isActive", false)).toBe("Hayır");
    expect(auditValue("tags", ["a", "b"])).toBe("a, b");
    expect(auditValue("meta", { a: 1 })).toBe("Yapılandırılmış veri");
  });

  it("sorumluyu kullanıcı adına çevirir, bulunamazsa id'yi bırakır", () => {
    const names = new Map([["u1", "Ayşe Yılmaz"]]);
    expect(auditValue("ownerUserId", "u1", names)).toBe("Ayşe Yılmaz");
    expect(auditValue("ownerUserId", "u2", names)).toBe("u2");
  });
});

describe("auditSide", () => {
  it("nesne olmayan girdide boş döner", () => {
    expect(auditSide("Önce", null)).toBe("");
    expect(auditSide("Önce", [1, 2])).toBe("");
    expect(auditSide("Önce", {})).toBe("");
  });

  it("alan adlarını Türkçe etiketlere çevirir, bilinmeyeni olduğu gibi bırakır", () => {
    expect(auditSide("Önce", { probability: 50, bilinmeyen: "x" })).toBe("Önce — Olasılık: 50 | bilinmeyen: x");
  });
});

describe("auditDetail", () => {
  it("iki tarafı birleştirir ve dolu olmayanı atlar", () => {
    expect(auditDetail({ probability: 10 }, { probability: 20 })).toBe("Önce — Olasılık: 10 · Sonra — Olasılık: 20");
    expect(auditDetail(null, { probability: 20 })).toBe("Sonra — Olasılık: 20");
  });

  it("500 karakteri aşan çıktıyı kırpar", () => {
    const long = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`alan${i}`, "x".repeat(20)]));
    const result = auditDetail(long, null);
    // 497 karakter + tek karakterlik "…" = 498; sınır 500'ün altında kalır.
    expect(result.length).toBe(498);
    expect(result.endsWith("…")).toBe(true);
  });
});
