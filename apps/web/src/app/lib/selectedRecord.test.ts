import { describe, expect, it } from "vitest";
import { selectedRecordById } from "./selectedRecord";

describe("selectedRecordById", () => {
  it("keeps an open detail view attached to the refreshed server record", () => {
    const selectedId = "installation-1";
    const beforeRefresh = [{ id: selectedId, formNo: "KRL-001" }];
    const afterRefresh = [{ id: selectedId, formNo: "KRL-002" }];

    expect(selectedRecordById(beforeRefresh, selectedId)?.formNo).toBe("KRL-001");
    expect(selectedRecordById(afterRefresh, selectedId)?.formNo).toBe("KRL-002");
  });

  it("closes the detail view when the refreshed record no longer exists", () => {
    expect(selectedRecordById([], "deleted-payment")).toBeNull();
    expect(selectedRecordById([{ id: "payment-1" }], null)).toBeNull();
  });
});
