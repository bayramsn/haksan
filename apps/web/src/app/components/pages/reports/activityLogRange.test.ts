import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRange } from "./ActivityLogReportCard";

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T10:00:00`));
};

afterEach(() => vi.useRealTimers());

describe("haftalık rapor varsayılan aralığı", () => {
  it("hafta ortasından o haftanın pazartesi–cumartesisini verir", () => {
    at("2026-09-10"); // perşembe
    expect(defaultRange()).toEqual({ from: "2026-09-07", to: "2026-09-12" });
  });

  it("pazar gününü biten haftaya sayar", () => {
    // getDay() pazarda 0; düzeltilmemiş formül pazarı ertesi haftaya atıyordu.
    at("2026-09-13");
    expect(defaultRange()).toEqual({ from: "2026-09-07", to: "2026-09-12" });
  });
});
