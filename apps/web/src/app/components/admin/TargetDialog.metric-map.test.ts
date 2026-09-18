import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TARGET_TEMPLATES,
  currentPeriod,
  emptyTarget,
  mergeTargetItems,
  targetItemKey,
} from "./TargetDialog";

const source = readFileSync(new URL("./TargetDialog.tsx", import.meta.url), "utf8");

const template = (targetType: keyof typeof TARGET_TEMPLATES, activity: string) => {
  const found = TARGET_TEMPLATES[targetType].find((row) => row.activity === activity);
  if (!found) throw new Error(`şablon kalemi bulunamadı: ${activity}`);
  return found;
};

describe("hedef kalemi ölçüm eşlemesi", () => {
  it("eylem türü konudan önce gelir", () => {
    // "Teklif takip ziyareti" bir ziyarettir: ZİYARET/ARAMA kontrolleri
    // TEKLİF'ten önce olmalı, yoksa bu kalemler teklif sayısıyla ölçülür.
    const visit = source.indexOf('text.includes("ZİYARET")');
    const call = source.indexOf('text.includes("ARAMA")');
    const quote = source.indexOf('text.includes("TEKLİF")');
    expect(visit).toBeGreaterThan(0);
    expect(visit).toBeLessThan(quote);
    expect(call).toBeLessThan(quote);
  });

  it("tutar bazlı kalan kalemler manuel kalmaz", () => {
    // Yedek parça & aksesuar satışı gibi tutar hedefleri satış cirosundan ölçülür.
    expect(source).toContain('if (row.unit === "amount") return "salesAmount";');
  });
});

describe("şablon ölçüm anahtarları", () => {
  it("satış hedefini teslim edilen tezgaha bağlar", () => {
    // Kalemin kendi açıklaması "tezgah teslimi yapıldığında" der; sipariş
    // sayısıyla ölçmek teslimat olmadan başarı yazıyordu.
    expect(template("sales", "SATIŞ HEDEFİ").metricKey).toBe("machineDeliveredCount");
  });

  it("dijital pazarlama kalemlerini manuel bırakır", () => {
    for (const activity of ["ÇEVRİMİÇİ TOPLANTI", "LINKEDIN PAYLAŞIMI", "INSTAGRAM PAYLAŞIMI", "YOUTUBE PAYLAŞIMI", "WHATSAPP DURUM"]) {
      const row = template("sales", activity);
      expect(row.metricKey, activity).toBeNull();
      expect(row.trackingMode, activity).toBe("manual");
    }
  });

  it("teklif takip ziyaretini ziyaret sayacına bağlar", () => {
    expect(template("sales", "TEKLİF TAKİP ZİYARETİ").metricKey).toBe("visitTarget");
  });
});

describe("hedef formu varsayılanları", () => {
  it("yeni hedef boş açılır", () => {
    // Şablon değerleri otomatik yazıldığında satış kullanıcısına finans/lojistik
    // kalemleri de fark edilmeden atanıyordu.
    const items = emptyTarget().targetItems;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.target === "")).toBe(true);
  });

  it("eski bir hedefi düzenlerken kayıtta olmayan kalemi doldurmaz", () => {
    const stored = [{ ...template("sales", "SATIŞ HEDEFİ"), target: "3", manualActual: "" }];
    const merged = mergeTargetItems(stored);
    const filled = merged.filter((item) => item.target !== "");
    expect(filled).toHaveLength(1);
    expect(targetItemKey(filled[0])).toBe("sales:SATIŞ:SATIŞ HEDEFİ");
  });

  it("manuel gerçekleşmeyi kayıttan geri okur", () => {
    const stored = [{ ...template("finance", "CARİ MUTABAKAT"), target: "10", manualActual: "4" }];
    const row = mergeTargetItems(stored).find((item) => item.activity === "CARİ MUTABAKAT");
    expect(row).toMatchObject({ target: "10", manualActual: "4" });
  });

  it("eski kayıttaki yanlış ölçüm anahtarını taşımaz", () => {
    const stored = [{ ...template("sales", "LINKEDIN PAYLAŞIMI"), metricKey: "digitalLeadTarget", target: "10" }];
    const row = mergeTargetItems(stored).find((item) => item.activity === "LINKEDIN PAYLAŞIMI");
    expect(row?.metricKey).toBeNull();
    expect(row?.trackingMode).toBe("manual");
  });
});

describe("currentPeriod", () => {
  it("dönemi yerel takvimden okur", () => {
    // UTC 31 Aralık 22:00 → UTC+03'te 1 Ocak. `toISOString` ile hesaplanan eski
    // sürüm bu anda hâlâ "2025-12" veriyor ve kullanıcı yanlış dönemi düzenliyordu.
    const instant = new Date(Date.UTC(2025, 11, 31, 22, 0, 0));
    const localMonth = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}`;
    expect(currentPeriod(instant)).toBe(localMonth);
  });
});
