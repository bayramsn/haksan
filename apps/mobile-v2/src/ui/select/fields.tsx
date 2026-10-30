import { productPriceLabel } from '@/src/ui/products/product-price';
import { useMemo } from 'react';
import { COUNTRY_OPTIONS, DISTRICTS_BY_PROVINCE } from '@haksan/shared';
import { useCompany, useCompanyList } from '@/src/api/companies.hooks';
import { useTaxOffices } from '@/src/api/crm-general.hooks';
import { useContactList, useLookup, useOpportunityAssignees } from '@/src/api/crm.hooks';
import { useInventoryList, useProductList } from '@/src/api/inventory.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useBrands } from '@/src/api/products.hooks';
import type { Brand } from '@/src/api/products.api';
import type { CompanyListItem, ContactListItem, InventoryItem, ProductModel } from '@/src/api/endpoints';
import { SearchSelect, useSearchRemoteBag, type RemoteOptions, type SelectItem } from './SearchSelect';
import { INCOTERMS, addressText, distinctValues, matchesStockLine, provinceOptions } from './select-logic';

type Common = {
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
};

export const companyLabel = (company: Pick<CompanyListItem, 'shortName' | 'legalTitle'>) =>
  company.shortName ?? company.legalTitle;

function useCompanyOptions(search: string): RemoteOptions<CompanyListItem> {
  const list = useCompanyList(
    useMemo(() => ({ search: search || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );
  return {
    items: (list.data?.items ?? []).map((company) => ({
      id: company.id,
      label: companyLabel(company),
      hint: [company.shortName ? company.legalTitle : null, company.primaryAddress?.province].filter(Boolean).join(' · ') || null,
      data: company,
    })),
    isPending: list.isPending,
    isFetching: list.isFetching && !list.isFetchingNextPage,
    error: list.error,
    refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: () => void list.fetchNextPage(),
  };
}

/** Kayıtlı firmalardan sunucu araması. `allowCustom` ile kayıtsız firma unvanı yazılabilir. */
export function CompanySelect({
  value,
  selectedId,
  onSelect,
  allowCustom,
  createLabel,
  ...rest
}: Common & {
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<CompanyListItem> | null) => void;
  allowCustom?: boolean;
  createLabel?: (query: string) => string;
}) {
  return (
    <SearchSelect
      label={rest.label ?? 'Firma'}
      placeholder={rest.placeholder ?? 'Kayıtlı firmadan seçin veya yazın'}
      icon="business-outline"
      value={value}
      selectedId={selectedId}
      onSelect={onSelect}
      useRemote={useCompanyOptions}
      allowCustom={allowCustom}
      createLabel={createLabel}
      searchPlaceholder={rest.searchPlaceholder ?? 'Firma ara…'}
      emptyTitle="Firma bulunamadı"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable}
    />
  );
}

export const contactPhone = (c: ContactListItem) => c.mobilePhone || c.workPhone || '';
export const contactEmail = (c: ContactListItem) => c.workEmail || c.personalEmail || '';

function useContactOptions(search: string): RemoteOptions<ContactListItem> {
  const companyId = useSearchRemoteBag<string | null>();
  const list = useContactList(
    useMemo(
      () => ({ companyId: companyId ?? undefined, search: search || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
      [companyId, search]
    )
  );
  return {
    items: (list.data?.items ?? []).map((contact) => ({
      id: contact.id,
      label: contact.fullName,
      hint: [contact.title, contactPhone(contact) || contactEmail(contact)].filter(Boolean).join(' · ') || null,
      data: contact,
    })),
    isPending: list.isPending,
    isFetching: list.isFetching && !list.isFetchingNextPage,
    error: list.error,
    refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: () => void list.fetchNextPage(),
  };
}

/** Firmaya bağlı kontaklar; serbest metin akışında firma yoksa CRM rehberinin tamamı aranır. */
export function ContactSelect({
  companyId,
  value,
  selectedId,
  onSelect,
  allowCustom,
  ...rest
}: Common & {
  companyId: string | null;
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<ContactListItem> | null) => void;
  allowCustom?: boolean;
}) {
  return (
    <SearchSelect
      label={rest.label ?? 'Kontak'}
      placeholder={rest.placeholder ?? (companyId ? 'Firmanın kontağını seçin' : 'Önce firma seçin')}
      icon="person-outline"
      value={value}
      selectedId={selectedId}
      onSelect={onSelect}
      useRemote={useContactOptions}
      remoteBag={companyId}
      allowCustom={allowCustom}
      searchPlaceholder="Ad, unvan veya telefon"
      emptyTitle="Kontak bulunamadı"
      error={rest.error}
      disabled={rest.disabled || (!companyId && !allowCustom)}
      clearable={rest.clearable}
    />
  );
}

export const productLabel = (p: Pick<ProductModel, 'fullName' | 'modelName' | 'modelCode'>) =>
  p.fullName || p.modelName || p.modelCode;

function useProductOptions(search: string): RemoteOptions<ProductModel> {
  const categoryCode = useSearchRemoteBag<string | null>();
  const list = useProductList(
    useMemo(
      () => ({ search: search || undefined, ...(categoryCode ? { categoryCode } : {}) }),
      [search, categoryCode]
    )
  );
  return {
    items: (list.data?.items ?? []).map((product) => ({
      id: product.id,
      label: productLabel(product),
      hint: [product.modelCode, product.brand?.name, product.category?.name, `Liste: ${productPriceLabel(product.listPrice, product.currency?.code)}`, `Peşin: ${productPriceLabel(product.cashPrice, product.currency?.code)}`].filter(Boolean).join(' · ') || null,
      data: product,
    })),
    isPending: list.isPending,
    isFetching: list.isFetching && !list.isFetchingNextPage,
    error: list.error,
    refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: () => void list.fetchNextPage(),
  };
}

/** Ürün kataloğundan arama; katalogda olmayan makine adı yazılabilir (id boş). */
export function ProductSelect({
  value,
  selectedId,
  onSelect,
  allowCustom = true,
  categoryCode,
  ...rest
}: Common & {
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<ProductModel> | null) => void;
  allowCustom?: boolean;
  /** Web CreateCaseDialog — örn. yalnız TEZGAH. */
  categoryCode?: string | null;
}) {
  return (
    <SearchSelect
      label={rest.label ?? 'Ürün'}
      placeholder={rest.placeholder ?? 'Katalogdan ürün arayın'}
      icon="cube-outline"
      value={value}
      selectedId={selectedId}
      onSelect={onSelect}
      useRemote={useProductOptions}
      remoteBag={categoryCode ?? null}
      allowCustom={allowCustom}
      searchPlaceholder="Model adı, kodu veya marka"
      emptyTitle="Ürün bulunamadı"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable}
    />
  );
}

const PROVINCES = provinceOptions(Object.keys(DISTRICTS_BY_PROVINCE));

export function ProvinceSelect({ value, onChange, ...rest }: Common & { value: string; onChange: (value: string) => void }) {
  return (
    <SearchSelect
      label={rest.label ?? 'İl'}
      placeholder={rest.placeholder ?? 'İl seçin veya yazın'}
      icon="location-outline"
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={PROVINCES}
      allowCustom
      searchPlaceholder={rest.searchPlaceholder ?? 'İl ara…'}
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

export function DistrictSelect({
  province,
  value,
  onChange,
  ...rest
}: Common & { province: string; value: string; onChange: (value: string) => void }) {
  const options = useMemo(
    () => [...(DISTRICTS_BY_PROVINCE[province] ?? [])].sort((a, b) => a.localeCompare(b, 'tr')).map((name) => ({ id: name, label: name })),
    [province]
  );
  return (
    <SearchSelect
      label={rest.label ?? 'İlçe'}
      placeholder={rest.placeholder ?? (province ? 'İlçe seçin veya yazın' : 'Önce il seçin')}
      icon="navigate-outline"
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={options}
      allowCustom
      searchPlaceholder={rest.searchPlaceholder ?? 'İlçe ara…'}
      error={rest.error}
      disabled={rest.disabled || !province}
      clearable={rest.clearable ?? true}
    />
  );
}

/** `GET /lookups/:name` listesinden kod seçimi (irtibat şekli, kayıp nedeni vb.). */
export function LookupSelect({
  name,
  value,
  onChange,
  icon = 'list-outline',
  ...rest
}: Common & {
  name: string;
  value: string;
  onChange: (code: string) => void;
  icon?: React.ComponentProps<typeof SearchSelect>['icon'];
}) {
  const lookup = useLookup(name);
  const options = useMemo(() => (lookup.data ?? []).map((row) => ({ id: row.code, label: row.name })), [lookup.data]);
  const selected = options.find((option) => option.id === value);
  return (
    <SearchSelect
      label={rest.label ?? 'Seçim'}
      placeholder={rest.placeholder ?? 'Seçin'}
      icon={icon}
      value={selected?.label ?? value}
      selectedId={value}
      onSelect={(item) => onChange(item?.id ?? '')}
      options={options}
      optionsLoading={lookup.isPending}
      optionsError={lookup.error}
      onOptionsRetry={() => void lookup.refetch()}
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** Fırsat sorumlusu adayları (`/opportunities/assignees`), bölüme göre süzülür. */
export function AssigneeSelect({
  value,
  onChange,
  divisionId,
  onlyUserId,
  ...rest
}: Common & {
  value: string;
  onChange: (userId: string) => void;
  divisionId?: string | null;
  /** Başkasına atama yetkisi yoksa yalnız kendisi listelenir. */
  onlyUserId?: string | null;
}) {
  const assignees = useOpportunityAssignees();
  const options = useMemo(
    () =>
      (assignees.data ?? [])
        .filter((item) => !onlyUserId || item.id === onlyUserId)
        .filter((item) => !divisionId || item.divisionIds.length === 0 || item.divisionIds.includes(divisionId))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        .map((item) => ({ id: item.id, label: item.name })),
    [assignees.data, divisionId, onlyUserId]
  );
  const selected = options.find((option) => option.id === value);
  return (
    <SearchSelect
      label={rest.label ?? 'Sorumlu'}
      placeholder={rest.placeholder ?? 'Atama kuralına bırak'}
      icon="person-circle-outline"
      value={selected?.label ?? ''}
      selectedId={value}
      onSelect={(item) => onChange(item?.id ?? '')}
      options={options}
      optionsLoading={assignees.isPending}
      optionsError={assignees.error}
      onOptionsRetry={() => void assignees.refetch()}
      searchPlaceholder="Kişi ara"
      emptyTitle="Uygun kişi yok"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

export type DirectoryPerson = { id: string; fullName: string; email: string };

/** Kurum içi kullanıcı rehberi (`/chat/directory`); belge formlarında ad metni olarak saklanır. */
export function UserSelect({
  value,
  selectedId,
  onSelect,
  allowCustom = true,
  ...rest
}: Common & {
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<DirectoryPerson> | null) => void;
  allowCustom?: boolean;
}) {
  const directory = useDirectory();
  const options = useMemo(
    () =>
      [...(directory.data ?? [])]
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'))
        .map((person) => ({ id: person.id, label: person.fullName, hint: person.email, data: person })),
    [directory.data]
  );
  return (
    <SearchSelect
      label={rest.label ?? 'Kullanıcı'}
      placeholder={rest.placeholder ?? 'Personel seçin'}
      icon="person-circle-outline"
      value={value}
      selectedId={selectedId ?? options.find((option) => option.label === value)?.id}
      onSelect={onSelect}
      options={options}
      optionsLoading={directory.isPending}
      optionsError={directory.error}
      onOptionsRetry={() => void directory.refetch()}
      allowCustom={allowCustom}
      searchPlaceholder="Ad veya e-posta"
      emptyTitle="Kullanıcı bulunamadı"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** Kayıtlı ürün markaları (`/brands`); listede olmayan marka adı yazılabilir. */
export function BrandSelect({
  value,
  onSelect,
  divisionId,
  allowCustom = true,
  ...rest
}: Common & {
  value: string;
  onSelect: (item: SelectItem<Brand> | null) => void;
  divisionId?: string;
  allowCustom?: boolean;
}) {
  const brands = useBrands(divisionId);
  const options = useMemo(
    () =>
      [...(brands.data ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        .map((brand) => ({ id: brand.id, label: brand.name, hint: brand.country, data: brand })),
    [brands.data]
  );
  return (
    <SearchSelect
      label={rest.label ?? 'Marka'}
      placeholder={rest.placeholder ?? 'Marka seçin'}
      icon="ribbon-outline"
      value={value}
      selectedId={options.find((option) => option.label === value)?.id}
      onSelect={onSelect}
      options={options}
      optionsLoading={brands.isPending}
      optionsError={brands.error}
      onOptionsRetry={() => void brands.refetch()}
      allowCustom={allowCustom}
      searchPlaceholder="Marka ara"
      emptyTitle="Marka bulunamadı"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** `GET /lookups/tax-offices`; seçili ile ait daireler üstte listelenir. */
export function TaxOfficeSelect({
  value,
  onChange,
  province,
  ...rest
}: Common & { value: string; onChange: (name: string) => void; province?: string | null }) {
  const offices = useTaxOffices(undefined);
  const options = useMemo(() => {
    const city = province?.trim().toLocaleLowerCase('tr') ?? '';
    const inCity = (row: { province: string | null }) => Number(Boolean(city) && (row.province ?? '').toLocaleLowerCase('tr') === city);
    return [...(offices.data ?? [])]
      .sort((a, b) => inCity(b) - inCity(a) || a.name.localeCompare(b.name, 'tr'))
      .map((row) => ({ id: row.name, label: row.name, hint: row.province }));
  }, [offices.data, province]);
  return (
    <SearchSelect
      label={rest.label ?? 'Vergi Dairesi'}
      placeholder={rest.placeholder ?? 'Vergi dairesi seçin'}
      icon="receipt-outline"
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={options}
      optionsLoading={offices.isPending}
      optionsError={offices.error}
      onOptionsRetry={() => void offices.refetch()}
      allowCustom
      searchPlaceholder="Daire adı veya il"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

const COUNTRIES = COUNTRY_OPTIONS.map((name) => ({ id: name, label: name }));

export function CountrySelect({ value, onChange, ...rest }: Common & { value: string; onChange: (value: string) => void }) {
  return (
    <SearchSelect
      label={rest.label ?? 'Ülke'}
      placeholder={rest.placeholder ?? 'Ülke seçin'}
      icon="earth-outline"
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={COUNTRIES}
      allowCustom
      searchPlaceholder="Ülke ara"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

const INCOTERM_OPTIONS = INCOTERMS.map((row) => ({ id: row.code, label: row.code, hint: row.name }));

export function IncotermSelect({ value, onChange, ...rest }: Common & { value: string; onChange: (value: string) => void }) {
  return (
    <SearchSelect
      label={rest.label ?? 'Incoterm'}
      placeholder={rest.placeholder ?? 'Teslim şekli seçin'}
      icon="boat-outline"
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={INCOTERM_OPTIONS}
      allowCustom
      searchPlaceholder="EXW, FOB, CIF..."
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** Seçili firmanın kayıtlı adresleri; firma yoksa ya da adres listede yoksa metin yazılabilir. */
export function CompanyAddressSelect({
  companyId,
  value,
  onChange,
  ...rest
}: Common & { companyId: string | null | undefined; value: string; onChange: (value: string) => void }) {
  const company = useCompany(companyId ?? '');
  const options = useMemo(
    () =>
      (company.data?.addresses ?? [])
        .map((address) => ({ id: address.id, label: addressText(address), hint: address.isDefault ? 'Varsayılan adres' : null }))
        .filter((option) => option.label),
    [company.data]
  );
  return (
    <SearchSelect
      label={rest.label ?? 'Adres'}
      placeholder={rest.placeholder ?? (companyId ? 'Firma adresinden seçin veya yazın' : 'Adres yazın')}
      icon="location-outline"
      value={value}
      selectedId={options.find((option) => option.label === value)?.id}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={options}
      optionsLoading={Boolean(companyId) && company.isPending}
      optionsError={company.error}
      onOptionsRetry={() => void company.refetch()}
      allowCustom
      searchPlaceholder="Adres ara veya yazın"
      emptyTitle={companyId ? 'Kayıtlı adres yok' : 'Firma seçilmedi'}
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** Stok kalemleri (`/inventory`) arasında seri no araması; kategori/ürün filtresi istemcide uygulanır. */
function useSerialOptions(search: string): RemoteOptions<InventoryItem> {
  const { categoryCode, productModelId } = useSearchRemoteBag<{
    categoryCode?: string | null;
    productModelId?: string | null;
  }>() ?? {};
  const list = useInventoryList(
    useMemo(() => ({ search: search || undefined, categoryCode: categoryCode || undefined }), [search, categoryCode])
  );
  return {
    items: (list.data?.items ?? [])
      .filter((item) => matchesStockLine(item, { categoryCode, productModelId }))
      .map((item) => ({
        id: item.id,
        label: item.serialNumber,
        hint: [item.brand?.name, item.product?.fullName ?? item.product?.modelCode, item.status?.name].filter(Boolean).join(' · ') || null,
        data: item,
      })),
    isPending: list.isPending,
    isFetching: list.isFetching && !list.isFetchingNextPage,
    error: list.error,
    refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: () => void list.fetchNextPage(),
  };
}

export function InventorySerialSelect({
  categoryCode,
  productModelId,
  value,
  selectedId,
  onSelect,
  ...rest
}: Common & {
  categoryCode?: string | null;
  productModelId?: string | null;
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<InventoryItem> | null) => void;
}) {
  const remoteBag = useMemo(() => ({ categoryCode, productModelId }), [categoryCode, productModelId]);
  return (
    <SearchSelect
      label={rest.label ?? 'Seri No'}
      placeholder={rest.placeholder ?? 'Stoktan seri no seçin veya yazın'}
      icon="barcode-outline"
      value={value}
      selectedId={selectedId}
      onSelect={onSelect}
      useRemote={useSerialOptions}
      remoteBag={remoteBag}
      allowCustom
      searchPlaceholder="Seri no, model veya marka"
      emptyTitle="Stok kalemi bulunamadı"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

function useEmailOptions(search: string): RemoteOptions<ContactListItem> {
  const companyId = useSearchRemoteBag<string | null>();
  const list = useContactList(
    useMemo(
      () => ({ companyId: companyId ?? undefined, search: search || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
      [companyId, search]
    )
  );
  return {
    items: (list.data?.items ?? [])
      .filter((contact) => contactEmail(contact))
      .map((contact) => ({
        id: contact.id,
        label: contactEmail(contact),
        hint: [contact.fullName, contact.company ? companyLabel(contact.company) : null].filter(Boolean).join(' · ') || null,
        data: contact,
      })),
    isPending: list.isPending,
    isFetching: list.isFetching && !list.isFetchingNextPage,
    error: list.error,
    refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: () => void list.fetchNextPage(),
  };
}

/** Tüm kontaklar arasında e-posta adresi olanlar; listede olmayan adres yazılabilir. */
export function ContactEmailSelect({
  companyId,
  value,
  onChange,
  ...rest
}: Common & { companyId?: string | null; value: string; onChange: (email: string, contact: ContactListItem | null) => void }) {
  return (
    <SearchSelect
      label={rest.label ?? 'Alıcı'}
      placeholder={rest.placeholder ?? 'Kontak seçin veya e-posta yazın'}
      icon="mail-outline"
      value={value}
      onSelect={(item) => onChange(item?.label.trim() ?? '', item?.data ?? null)}
      useRemote={useEmailOptions}
      remoteBag={companyId ?? null}
      allowCustom
      searchPlaceholder="Ad, firma veya e-posta"
      emptyTitle="E-postası olan kontak yok"
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}

/** Kayıtlı değerlerden (ör. stoktaki kontrol üniteleri) seçim; yeni değer yazılabilir. */
export function SuggestionSelect({
  value,
  onChange,
  values,
  loading,
  icon = 'list-outline',
  ...rest
}: Common & {
  value: string;
  onChange: (value: string) => void;
  values: readonly (string | null | undefined)[];
  loading?: boolean;
  icon?: React.ComponentProps<typeof SearchSelect>['icon'];
}) {
  const options = useMemo(() => distinctValues(values).map((item) => ({ id: item, label: item })), [values]);
  return (
    <SearchSelect
      label={rest.label ?? 'Seçim'}
      placeholder={rest.placeholder ?? 'Seçin veya yazın'}
      icon={icon}
      value={value}
      selectedId={value}
      onSelect={(item) => onChange(item?.label ?? '')}
      options={options}
      optionsLoading={loading}
      allowCustom
      error={rest.error}
      disabled={rest.disabled}
      clearable={rest.clearable ?? true}
    />
  );
}
