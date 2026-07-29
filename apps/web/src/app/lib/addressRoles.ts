export type AddressRoleKey = "isDefault" | "isShipping" | "isBilling";

export type AddressRoleState = {
  isDefault?: boolean;
  isShipping?: boolean;
  isBilling?: boolean;
};

const ADDRESS_ROLE_KEYS: AddressRoleKey[] = ["isDefault", "isShipping", "isBilling"];

/**
 * Her kullanım rolünü en fazla bir adreste tutar. Hiç seçilmemiş bir rolü
 * kendiliğinden başka bir adrese atamaz; böylece kullanıcının seçimi korunur.
 */
export const normalizeAddressRoles = <T extends AddressRoleState>(addresses: T[]): T[] => {
  const claimedRoles = new Set<AddressRoleKey>();

  return addresses.map((address) => {
    const normalized = { ...address };
    for (const role of ADDRESS_ROLE_KEYS) {
      const selected = Boolean(address[role]) && !claimedRoles.has(role);
      normalized[role] = selected;
      if (selected) claimedRoles.add(role);
    }
    return normalized;
  });
};

/**
 * Bir rol seçildiğinde diğer adreslerden kaldırır; seçili role yeniden
 * tıklandığında rolü tamamen kapatır.
 */
export const toggleAddressRole = <T extends AddressRoleState>(
  addresses: T[],
  role: AddressRoleKey,
  selectedIndex: number,
): T[] => {
  const shouldSelect = !addresses[selectedIndex]?.[role];

  return addresses.map((address, index) => ({
    ...address,
    [role]: shouldSelect && index === selectedIndex,
  }));
};
