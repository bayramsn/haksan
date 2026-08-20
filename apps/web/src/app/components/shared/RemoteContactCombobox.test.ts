import { describe, expect, it } from "vitest";
import { normalizeServerContact } from "../../lib/contactServerData";
import {
  mergeRemoteContactOptions,
  REMOTE_CONTACT_PAGE_SIZE,
  remoteContactQueryKeys,
  remoteContactScope,
} from "./RemoteContactCombobox";

const contact = (id: string, fullName: string) => normalizeServerContact({
  id,
  fullName,
  companyId: "company-1",
  createdAt: "2026-08-10T00:00:00.000Z",
});

describe("RemoteContactCombobox", () => {
  it("sunucu aramasını 25 kayıtla sınırlar", () => {
    expect(REMOTE_CONTACT_PAGE_SIZE).toBe(25);
  });

  it("sayfada olmayan seçili kontağı ayrıca hydrate eder", () => {
    const options = mergeRemoteContactOptions(
      [contact("page-1", "Sayfadaki Kontak")],
      contact("selected", "Seçili Eski Kontak"),
    );

    expect(options.map((option) => option.value)).toEqual(["selected", "page-1"]);
    expect(options[0]?.label).toBe("Seçili Eski Kontak");
  });

  it("güncel liste kaydı seçili detay kaydını mükerrer üretmeden yeniler", () => {
    const options = mergeRemoteContactOptions(
      [contact("selected", "Güncel Ad")],
      contact("selected", "Eski Ad"),
    );

    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe("Güncel Ad");
  });

  it("query key'lerini tenant ve kullanıcı kimliğine göre ayırır", () => {
    const firstScope = remoteContactScope({
      tenantId: "tenant-a",
      userId: "user-a",
      activeDivision: "division-a",
      activeDepartment: "department-a",
    });
    const secondScope = remoteContactScope({
      tenantId: "tenant-b",
      userId: "user-b",
      activeDivision: "division-a",
      activeDepartment: "department-a",
    });

    expect(remoteContactQueryKeys.options(firstScope, "company-1", "ayşe"))
      .not.toEqual(remoteContactQueryKeys.options(secondScope, "company-1", "ayşe"));
    expect(remoteContactQueryKeys.detail(firstScope, "contact-1"))
      .not.toEqual(remoteContactQueryKeys.detail(secondScope, "contact-1"));
  });
});
