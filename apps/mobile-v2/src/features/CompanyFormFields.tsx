import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CompanyAddressInput } from '@haksan/shared';
import { useLookup } from '@/src/api/crm.hooks';
import type { CompanyAddress } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Card, Eyebrow, Field, FilterChips } from '@/src/ui';

/**
 * Web CreateCustomerDialog / EditCustomerDialog ile aynı alan kümesi ve kurallar:
 * kurumsal/bireysel, firma tipi, statü, tedarikçi türü (tedarikçide zorunlu),
 * bağlı birim (zorunlu, çoklu), firma grubu, irtibat şekli (seçim ya da serbest
 * metin), iletişim, adresler (tür + varsayılan/sevk/fatura rolü + ülke), vergi.
 * Logo yükleme, OSM konum arama ve web sitesi önerisi webde kalır.
 */
export type FirmType = 'customer' | 'supplier' | 'supplier_customer' | 'competitor';
export type SupplierCategory = 'manufacturer' | 'transportation' | 'logistics';
export type AddressDraft = {
  key: string;
  original: CompanyAddress | null;
  addressType: CompanyAddressInput['addressType'];
  country: string;
  province: string;
  district: string;
  fullAddress: string;
  isDefault: boolean;
  isShipping: boolean;
  isBilling: boolean;
};
export type CompanyFormState = {
  companyType: 'company' | 'person';
  firmType: FirmType;
  salesStatus: 'potential' | 'active';
  supplierCategoryCode: SupplierCategory | null;
  divisionIds: string[];
  companyGroupCode: string | null;
  contactSourceCode: string | null;
  contactSourceText: string;
  sector: string;
  legalTitle: string;
  primaryPhone: string;
  secondaryPhone: string;
  fax: string;
  primaryEmail: string;
  secondaryEmail: string;
  website: string;
  taxOffice: string;
  taxNumber: string;
  notes: string;
  addresses: AddressDraft[];
};

const FIRM_TYPES: { value: FirmType; label: string }[] = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'supplier_customer', label: 'Müşteri + Tedarikçi' },
  { value: 'competitor', label: 'Rakip' },
];
const SUPPLIER_CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: 'manufacturer', label: 'Makine üreticisi' },
  { value: 'transportation', label: 'Nakliye' },
  { value: 'logistics', label: 'Lojistik' },
];
const ADDRESS_TYPES: { value: CompanyAddressInput['addressType']; label: string }[] = [
  { value: 'office', label: 'Ofis' },
  { value: 'factory', label: 'Fabrika' },
  { value: 'work_area', label: 'Çalışma Alanı' },
  { value: 'shipping', label: 'Sevkiyat' },
  { value: 'billing', label: 'Fatura' },
  { value: 'other', label: 'Diğer' },
];
// Web: yalnız iş birimleri ve görünür firma grupları seçilebilir.
const BUSINESS_UNIT_CODES = new Set(['cnc', 'universal', 'sac_isleme']);
const COMPANY_GROUP_CODES = new Set(['a_group', 'b_group', 'dealer_second_hand', 'potential_cnc_customer']);
const ROLE_LABEL = { isDefault: 'Varsayılan', isShipping: 'Sevk', isBilling: 'Fatura' } as const;
type RoleKey = keyof typeof ROLE_LABEL;

let draftSeq = 0;
export function newAddressDraft(first: boolean): AddressDraft {
  return { key: `new-${++draftSeq}`, original: null, addressType: 'office', country: 'Türkiye', province: '', district: '', fullAddress: '', isDefault: first, isShipping: first, isBilling: first };
}

/** Web normalizeAddressRoles: her rol en fazla bir adreste kalır. */
export function normalizeRoles(rows: AddressDraft[]): AddressDraft[] {
  const claimed = new Set<RoleKey>();
  return rows.map((row) => {
    const next = { ...row };
    for (const role of Object.keys(ROLE_LABEL) as RoleKey[]) {
      next[role] = row[role] && !claimed.has(role);
      if (next[role]) claimed.add(role);
    }
    return next;
  });
}

const text = (value: string): string | undefined => value.trim() || undefined;

export function toAddressInput(draft: AddressDraft): CompanyAddressInput {
  const original = draft.original;
  return {
    ...(original ? { id: original.id } : {}),
    addressType: draft.addressType,
    country: text(draft.country) ?? 'Türkiye',
    province: text(draft.province),
    district: text(draft.district),
    locality: original?.locality ?? undefined,
    zipCode: original?.zipCode ?? undefined,
    street: original?.street ?? undefined,
    buildingNumber: original?.buildingNumber ?? undefined,
    fullAddress: text(draft.fullAddress),
    latitude: original?.latitude != null ? Number(original.latitude) : undefined,
    longitude: original?.longitude != null ? Number(original.longitude) : undefined,
    isDefault: draft.isDefault,
    isShipping: draft.isShipping,
    isBilling: draft.isBilling,
  };
}

/** Web submit kontrolleriyle aynı sıra ve mesajlar. */
export function validateCompanyForm(form: CompanyFormState): string | null {
  if (!form.legalTitle.trim()) return 'Firma ünvanı zorunludur';
  if ((form.firmType === 'supplier' || form.firmType === 'supplier_customer') && !form.supplierCategoryCode) {
    return 'Tedarikçi türü seçiniz: Makine üreticisi, Nakliye veya Lojistik.';
  }
  if (!form.divisionIds.length) return 'Bağlı bulunduğu birimi seçiniz';
  return null;
}

/** İrtibat şekli: serbest metin varsa kod gönderilmez (sunucu ikisini birden reddeder). */
export function contactSourcePayload(form: CompanyFormState) {
  const freeText = form.contactSourceText.trim();
  return { contactSourceCode: freeText ? null : form.contactSourceCode, contactSourceText: freeText || null };
}

export function useBusinessUnits() {
  const { user } = useAuth();
  return (user?.divisions ?? []).filter((division) => BUSINESS_UNIT_CODES.has(division.code));
}

export function CompanyFormFields({ form, onChange }: { form: CompanyFormState; onChange: (next: CompanyFormState) => void }) {
  const { colors } = useTheme();
  const units = useBusinessUnits();
  const groups = useLookup('company-groups');
  const sources = useLookup('contact-sources');
  const set = <K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) => onChange({ ...form, [key]: value });
  const isSupplier = form.firmType === 'supplier' || form.firmType === 'supplier_customer';

  const editAddress = (key: string, patch: Partial<AddressDraft>) =>
    set('addresses', form.addresses.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const toggleRole = (key: string, role: RoleKey) => {
    const turnOn = !form.addresses.find((row) => row.key === key)?.[role];
    set('addresses', form.addresses.map((row) => ({ ...row, [role]: turnOn && row.key === key })));
  };

  return (
    <>
      <View className="gap-3">
        <Eyebrow>Firma</Eyebrow>
        <FilterChips options={[{ value: 'company', label: 'Kurumsal' }, { value: 'person', label: 'Bireysel' }]} value={form.companyType} onChange={(value) => value && set('companyType', value)} allLabel="" />
        <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Firma tipi *</Text><FilterChips options={FIRM_TYPES} value={form.firmType} onChange={(value) => value && set('firmType', value)} allLabel="" /></View>
        {isSupplier ? (
          <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Tedarikçi türü *</Text><FilterChips options={SUPPLIER_CATEGORIES} value={form.supplierCategoryCode} onChange={(value) => set('supplierCategoryCode', value)} allLabel="" /></View>
        ) : null}
        <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Firma statüsü</Text><FilterChips options={[{ value: 'active', label: 'Cari' }, { value: 'potential', label: 'Potansiyel' }]} value={form.salesStatus} onChange={(value) => value && set('salesStatus', value)} allLabel="" /></View>
        <View className="gap-1.5">
          <Text className="font-inter-medium text-[13px] text-muted-foreground">Bağlı bulunduğu birim *</Text>
          <View className="flex-row flex-wrap gap-2">
            {units.map((unit) => {
              const active = form.divisionIds.includes(unit.id);
              return (
                <Pressable key={unit.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => set('divisionIds', active ? form.divisionIds.filter((id) => id !== unit.id) : [...form.divisionIds, unit.id])} className={`min-h-10 justify-center rounded-full border px-4 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
                  <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{unit.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Firma grubu</Text><FilterChips options={(groups.data ?? []).filter((row) => COMPANY_GROUP_CODES.has(row.code)).map((row) => ({ value: row.code, label: row.name }))} value={form.companyGroupCode} onChange={(value) => set('companyGroupCode', value)} allLabel="" /></View>
        <View className="gap-1.5">
          <Text className="font-inter-medium text-[13px] text-muted-foreground">İrtibat şekli / kaynak</Text>
          <FilterChips options={(sources.data ?? []).map((row) => ({ value: row.code, label: row.name }))} value={form.contactSourceText.trim() ? null : form.contactSourceCode} onChange={(value) => onChange({ ...form, contactSourceCode: value, contactSourceText: '' })} allLabel="" />
          <Field label="Listede yoksa yazın" value={form.contactSourceText} onChangeText={(value) => onChange({ ...form, contactSourceText: value, contactSourceCode: value.trim() ? null : form.contactSourceCode })} maxLength={255} />
        </View>
        <Field label="Firma sektörü" value={form.sector} onChangeText={(value) => set('sector', value)} maxLength={128} />
        <Field label={form.companyType === 'company' ? 'Firma ünvanı *' : 'Ad soyad *'} value={form.legalTitle} onChangeText={(value) => set('legalTitle', value)} maxLength={255} />
      </View>

      <View className="gap-3">
        <Eyebrow>İletişim</Eyebrow>
        <Field label="Telefon-1" value={form.primaryPhone} onChangeText={(value) => set('primaryPhone', value)} keyboardType="phone-pad" placeholder="+90 ..." />
        <Field label="Telefon-2" value={form.secondaryPhone} onChangeText={(value) => set('secondaryPhone', value)} keyboardType="phone-pad" placeholder="+90 ..." />
        <Field label="Faks" value={form.fax} onChangeText={(value) => set('fax', value)} keyboardType="phone-pad" placeholder="+90 ..." />
        <Field label="Mail-1" value={form.primaryEmail} onChangeText={(value) => set('primaryEmail', value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Mail-2" value={form.secondaryEmail} onChangeText={(value) => set('secondaryEmail', value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Web sitesi" value={form.website} onChangeText={(value) => set('website', value)} keyboardType="url" autoCapitalize="none" placeholder="https://..." />
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Eyebrow>Adresler</Eyebrow>
          <Pressable accessibilityRole="button" accessibilityLabel="Adres ekle" onPress={() => set('addresses', [...form.addresses, newAddressDraft(form.addresses.length === 0)])} className="min-h-11 flex-row items-center gap-1 px-2 active:opacity-60">
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text className="font-inter-semibold text-[14px] text-primary">Adres ekle</Text>
          </Pressable>
        </View>
        {form.addresses.length === 0 ? <Text className="font-inter text-[13px] text-muted-foreground">Kayıtlı adres yok.</Text> : form.addresses.map((address) => (
          <Card key={address.key} className="gap-3">
            <FilterChips options={ADDRESS_TYPES} value={address.addressType} onChange={(value) => value && editAddress(address.key, { addressType: value })} allLabel="" />
            <View className="flex-row flex-wrap gap-2">
              {(Object.keys(ROLE_LABEL) as RoleKey[]).map((role) => (
                <Pressable key={role} accessibilityRole="checkbox" accessibilityState={{ checked: address[role] }} onPress={() => toggleRole(address.key, role)} className="min-h-10 flex-row items-center gap-1.5 pr-2 active:opacity-60">
                  <Ionicons name={address[role] ? 'checkbox' : 'square-outline'} size={19} color={address[role] ? colors.primary : colors.mutedForeground} />
                  <Text className="font-inter text-[13px] text-foreground">{ROLE_LABEL[role]}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Ülke" value={address.country} onChangeText={(value) => editAddress(address.key, { country: value })} maxLength={64} />
            <View className="flex-row gap-3">
              <View className="flex-1"><Field label="İl" value={address.province} onChangeText={(value) => editAddress(address.key, { province: value })} maxLength={64} /></View>
              <View className="flex-1"><Field label="İlçe" value={address.district} onChangeText={(value) => editAddress(address.key, { district: value })} maxLength={64} /></View>
            </View>
            <Field label="Açık adres" value={address.fullAddress} onChangeText={(value) => editAddress(address.key, { fullAddress: value })} multiline maxLength={1000} />
            <Pressable accessibilityRole="button" accessibilityLabel="Adresi sil" onPress={() => set('addresses', normalizeRoles(form.addresses.filter((row) => row.key !== address.key)))} className="min-h-11 flex-row items-center gap-1 self-end px-2 active:opacity-60">
              <Ionicons name="trash-outline" size={17} color={colors.destructive} />
              <Text className="font-inter-medium text-[13px] text-destructive">Sil</Text>
            </Pressable>
          </Card>
        ))}
      </View>

      <View className="gap-3">
        <Eyebrow>Vergi ve not</Eyebrow>
        <Field label="Vergi dairesi" value={form.taxOffice} onChangeText={(value) => set('taxOffice', value)} maxLength={128} />
        <Field label="T.C. / Vergi kimlik numarası" value={form.taxNumber} onChangeText={(value) => set('taxNumber', value)} keyboardType="number-pad" maxLength={32} />
        <Field label="Notlar" value={form.notes} onChangeText={(value) => set('notes', value)} multiline maxLength={4000} />
      </View>
    </>
  );
}
