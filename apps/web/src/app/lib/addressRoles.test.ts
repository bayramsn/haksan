import { describe, expect, it } from "vitest";
import { normalizeAddressRoles, toggleAddressRole } from "./addressRoles";

describe("address roles", () => {
  it("does not assign roles that the user did not select", () => {
    expect(normalizeAddressRoles([
      { id: "office", isDefault: false, isShipping: false, isBilling: false },
      { id: "factory", isDefault: false, isShipping: false, isBilling: false },
    ])).toEqual([
      { id: "office", isDefault: false, isShipping: false, isBilling: false },
      { id: "factory", isDefault: false, isShipping: false, isBilling: false },
    ]);
  });

  it("keeps at most one address for each role", () => {
    expect(normalizeAddressRoles([
      { id: "office", isDefault: true, isShipping: true },
      { id: "factory", isDefault: true, isShipping: true, isBilling: true },
    ])).toEqual([
      { id: "office", isDefault: true, isShipping: true, isBilling: false },
      { id: "factory", isDefault: false, isShipping: false, isBilling: true },
    ]);
  });

  it("moves a role to the clicked address", () => {
    expect(toggleAddressRole([
      { id: "office", isShipping: true },
      { id: "factory", isShipping: false },
    ], "isShipping", 1)).toEqual([
      { id: "office", isShipping: false },
      { id: "factory", isShipping: true },
    ]);
  });

  it("turns off a role when the selected address is clicked again", () => {
    expect(toggleAddressRole([
      { id: "office", isBilling: true },
      { id: "factory", isBilling: false },
    ], "isBilling", 0)).toEqual([
      { id: "office", isBilling: false },
      { id: "factory", isBilling: false },
    ]);
  });
});
