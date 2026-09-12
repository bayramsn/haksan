import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRange } from "./ActivityLogReportCard";

const at = (utcIso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utcIso));
};

afterEach(() => vi.useRealTimers());

describe("haftalık rapor varsayılan aralığı", () => {
  it("hafta ortasından o haftanın pazartesi–cumartesisini verir", () => {
    at("2026-09-10T07:00:00Z"); // perşembe, İstanbul 10:00
    expect(defaultRange()).toEqual({ from: "2026-09-07", to: "2026-09-12" });
  });

  it("pazar gününü biten haftaya sayar", () => {
    // getDay() pazarda 0; düzeltilmemiş formül pazarı ertesi haftaya atıyordu.
    at("2026-09-13T09:00:00Z");
    expect(defaultRange()).toEqual({ from: "2026-09-07", to: "2026-09-12" });
  });

  it("haftayı İstanbul takvimine göre keser", () => {
    // UTC'de hâlâ pazar 22:00, İstanbul'da pazartesi 01:00 — yeni hafta başlamış
    // olmalı. Yerel saate bakan eski hesap bir önceki haftayı veriyordu.
    at("2026-09-13T22:00:00Z");
    expect(defaultRange()).toEqual({ from: "2026-09-14", to: "2026-09-19" });
  });
});
