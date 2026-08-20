import { describe, expect, it } from "vitest";
import { printSignatureFromDocumentSnapshot, printSignatureFromSnapshot } from "./signature";

describe("belge imzası anlık görüntüsü", () => {
  it("ad, ünvan ve görseli yazdırma biçimine çevirir", () => {
    const result = printSignatureFromSnapshot({
      id: "sig-1",
      name: "Ayşe Yılmaz",
      title: "Satış Müdürü",
      fileId: "file-1",
      imageUrl: "/signatures/media/file-1",
      capturedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(result?.ad).toBe("Ayşe Yılmaz");
    expect(result?.unvan).toBe("Satış Müdürü");
    // Göreli yol API tabanına göre çözülür; taban ortama göre değiştiği için
    // (dev'de mutlak localhost, production'da /api/v1) yalnız kuyruğu sabittir.
    expect(result?.gorselUrl).toMatch(/\/api\/v1\/signatures\/media\/file-1$/);
  });

  it("görselsiz imzada yalnızca ad ve ünvan döner", () => {
    const result = printSignatureFromSnapshot({ name: "Mehmet Demir", title: "Koordinatör", imageUrl: null });
    expect(result).toEqual({ ad: "Mehmet Demir", unvan: "Koordinatör" });
    expect(result).not.toHaveProperty("gorselUrl");
  });

  it("imza yoksa undefined döner ki şablon eski davranışa düşsün", () => {
    expect(printSignatureFromSnapshot(null)).toBeUndefined();
    expect(printSignatureFromSnapshot(undefined)).toBeUndefined();
    // Adı olmayan bir blok imza sayılmaz: çıktıda boş satır bırakmaktansa
    // hazırlayan/proje ilgilisi basılmalı.
    expect(printSignatureFromSnapshot({ title: "Ünvan", imageUrl: "/signatures/media/x" })).toBeUndefined();
    expect(printSignatureFromSnapshot({ name: "   " })).toBeUndefined();
  });

  it("belge anlık görüntüsünün signature alanını okur", () => {
    expect(
      printSignatureFromDocumentSnapshot({ signature: { name: "Ayşe Yılmaz", title: "Satış Müdürü", imageUrl: null } }),
    ).toEqual({ ad: "Ayşe Yılmaz", unvan: "Satış Müdürü" });
    // İmzası olmayan eski belgeler (alan hiç yok) sessizce imzasız basılır.
    expect(printSignatureFromDocumentSnapshot({ quote: {} })).toBeUndefined();
    expect(printSignatureFromDocumentSnapshot(null)).toBeUndefined();
  });
});
