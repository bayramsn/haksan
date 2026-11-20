import { describe, expect, it } from "vitest";
import { applyOptionalEquipmentSpecs, optionalSpecsFromProductDetail } from "./optionalEquipmentSpecs";

describe("selected equipment technical values", () => {
  const base = [{ key: "Fener Mili Devri", value: "8000", unit: "dev/dk", groupCode: "FENER_MILI" }, { key: "X Eksen Hareketi", value: "800", unit: "mm" }];
  it("uses the option's own value before the template default, preserving machine units and groups", () => {
    const actual = applyOptionalEquipmentSpecs(base, [{ title: "Spindle", specs: [{ key: "Fener Mili Devri", value: "15000" }], specDefaults: [{ specKey: "Fener Mili Devri", defaultValue: "12000" }] }]);
    expect(actual[0]).toEqual({ ...base[0], value: "15000" });
    expect(actual[1]).toEqual(base[1]);
    expect(base[0].value).toBe("8000");
  });
  it("normalizes raw API detail specs before applying the equipment value instead of the template default", () => {
    const specs = optionalSpecsFromProductDetail({ specs: [{ specKey: "Fener Mili Devri", specValue: "15000", specUnit: "dev/dk", specGroupCode: "FENER_MILI" }] });
    const actual = applyOptionalEquipmentSpecs(base, [{ title: "15K", specs, specDefaults: [{ specKey: "Fener Mili Devri", defaultValue: "12000" }] }]);
    expect(actual[0]).toEqual({ ...base[0], value: "15000" });
    expect(specs[0].unit).toBe("dev/dk");
  });
  it("uses technical configuration specs before regular detail specs including an explicitly empty snapshot", () => {
    expect(optionalSpecsFromProductDetail({ specs: [{ specKey: "Fener Mili Devri", specValue: "8000" }], technicalConfiguration: { specs: [{ key: "Fener Mili Devri", value: "18000" }] } })[0].value).toBe("18000");
    expect(optionalSpecsFromProductDetail({ specs: [{ specKey: "Fener Mili Devri", specValue: "8000" }], technicalConfiguration: { specs: [] } })).toEqual([]);
  });
  it("uses meaningful template defaults, leaves unrelated and empty fields unchanged", () => {
    const actual = applyOptionalEquipmentSpecs(base, [{ title: "Spindle", specs: [{ key: "Fener Mili Devri", value: "-" }], specDefaults: [{ specKey: "Fener Mili Devri", defaultValue: "12000" }, { specKey: "X Eksen Hareketi", defaultValue: "" }, { specKey: "Diğer", defaultValue: "9" }] }]);
    expect(actual).toEqual([{ ...base[0], value: "12000" }, base[1]]);
  });
  it("matches aliases and Turkish technical names the same way as quote selection", () => {
    const actual = applyOptionalEquipmentSpecs([{ key: "Fener Mili Devri", value: "8000" }], [{ title: "Spindle", specs: [{ key: " FENER MİLİ DEVRİ ", value: "15000" }] }]);
    expect(actual[0].value).toBe("15000");
  });
  it("uses the most recently selected conflicting option", () => {
    const actual = applyOptionalEquipmentSpecs(base, [{ title: "12K", specs: [{ key: "Fener Mili Devri", value: "12000" }] }, { title: "15K", specs: [{ key: "Fener Mili Devri", value: "15000" }] }]);
    expect(actual[0].value).toBe("15000");
  });
  it("starts from the base again when deselected", () => {
    expect(applyOptionalEquipmentSpecs(base, [])).toEqual(base);
  });
});
