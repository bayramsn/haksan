import type { CompanyAddress, Customer } from "./mock";

export type QuoteCompanyDetailsDraft = {
  name: string;
  country: string;
  city: string;
  district: string;
  address: string;
};

export function buildQuoteCompanyDetailsDraft(
  company?: Customer,
  selectedAddress?: CompanyAddress,
): QuoteCompanyDetailsDraft {
  return {
    name: company?.name ?? "",
    country: selectedAddress?.country ?? company?.country ?? "Türkiye",
    city: selectedAddress?.city ?? company?.city ?? "",
    district: selectedAddress?.district ?? company?.district ?? "",
    address: selectedAddress?.address ?? company?.address ?? "",
  };
}

export function buildQuoteCompanyDetailsPatch(
  company: Customer,
  selectedAddressId: string,
  draft: QuoteCompanyDetailsDraft,
): Pick<Customer, "name" | "addresses"> {
  const name = draft.name.trim();
  if (!name) throw new Error("Firma adı boş bırakılamaz.");

  const addresses = [...(company.addresses ?? [])];
  const selectedIndex = selectedAddressId
    ? addresses.findIndex((address) => address.id === selectedAddressId)
    : -1;
  const selected = selectedIndex >= 0 ? addresses[selectedIndex] : undefined;
  const hasAddressValue = Boolean(
    draft.address.trim() || draft.district.trim() || draft.city.trim() || draft.country.trim(),
  );

  if (selected || hasAddressValue) {
    const nextAddress: CompanyAddress = {
      ...(selected ?? {
        addressType: "office",
        isDefault: addresses.length === 0,
        isBilling: addresses.length === 0,
        isShipping: false,
      }),
      country: draft.country.trim() || "Türkiye",
      city: draft.city.trim(),
      district: draft.district.trim(),
      address: draft.address.trim(),
    };

    if (selectedIndex >= 0) addresses[selectedIndex] = nextAddress;
    else addresses.push(nextAddress);
  }

  return { name, addresses };
}
