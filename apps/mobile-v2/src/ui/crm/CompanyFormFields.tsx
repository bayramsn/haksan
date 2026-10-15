import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  COMPANY_SECTOR_OPTIONS,
  COUNTRY_OPTIONS,
  DISTRICTS_BY_PROVINCE,
  TAX_OFFICE_OPTIONS,
} from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCompanyFormLookups, useTaxOffices } from '@/src/api/crm-general.hooks';
import { Field } from '@/src/ui';
import { OptionPicker, type PickerOption } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { OsmSearchPanel } from './OsmSearchPanel';
import { WebsiteLookupPanel } from './WebsiteLookupPanel';
import {
  ADDRESS_TYPE_OPTIONS,
  BUSINESS_UNIT_CODES,
  COMPANY_GROUP_CODES,
  COMPANY_GROUP_FALLBACK,
  CONTACT_SOURCE_FALLBACK,
  FIRM_TYPE_OPTIONS,
  SALES_STATUS_OPTIONS,
  SUPPLIER_CATEGORY_OPTIONS,
  applyWebsiteSuggestion,
  needsSupplierCategory,
  type CompanyFormErrors,
  type CompanyFormState,
} from './company-form-logic';

const PROVINCES = Object.keys(DISTRICTS_BY_PROVINCE).sort((a, b) => a.localeCompare(b, 'tr'));
const toOptions = (values: readonly string[]): PickerOption[] => values.map((value) => ({ value, label: value }));

/** Değer listede yoksa (serbest metin) seçicide yine görünsün. */
const withCurrent = (options: PickerOption[], value: string) =>
  value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options;

function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  multi,
}: {
  label: string;
  options: { value: T; label: string; hint?: string }[];
  value: T | T[] | '';
  onChange: (value: T) => void;
  error?: string;
  multi?: boolean;
}) {
  const selected = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <View className="gap-2">
      <Text className="font-inter-medium text-sm text-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = selected(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={multi ? { checked: active } : { selected: active }}
              accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-11 justify-center rounded-control border px-3 py-1.5 ${active ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-medium text-sm ${active ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text>
              {option.hint ? <Text className="font-inter text-[11px] text-muted-foreground">{option.hint}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="font-inter text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

/** Web Yeni Firma / Firmayı Düzenle diyalog alanları; iki modal ortak kullanır. */
export function CompanyFormFields({
  mode,
  form,
  onChange,
  errors,
}: {
  mode: 'create' | 'edit';
  form: CompanyFormState;
  onChange: (next: Partial<CompanyFormState>) => void;
  errors: CompanyFormErrors;
}) {
  const { user } = useAuth();
  const lookups = useCompanyFormLookups();
  const taxOffices = useTaxOffices(undefined);
  const isPerson = form.companyType === 'person';
  const isTurkey = !form.country || form.country === 'Türkiye';

  const divisionOptions = useMemo(
    () =>
      (user?.divisions ?? [])
        .filter((division) => BUSINESS_UNIT_CODES.has(division.code ?? ''))
        .map((division) => ({ value: division.id, label: division.name })),
    [user?.divisions],
  );

  const groupOptions = useMemo(() => {
    const rows = (lookups.groups ?? []).filter((row) => COMPANY_GROUP_CODES.has(row.code));
    return (rows.length ? rows : COMPANY_GROUP_FALLBACK).map((row) => ({ value: row.code, label: row.name }));
  }, [lookups.groups]);

  const sourceOptions = useMemo(() => {
    const rows = lookups.contactSources?.length ? lookups.contactSources : CONTACT_SOURCE_FALLBACK;
    return rows.map((row) => ({ value: row.code, label: row.name }));
  }, [lookups.contactSources]);

  const sectorOptions = useMemo(() => {
    const names = new Set<string>(COMPANY_SECTOR_OPTIONS);
    for (const row of lookups.sectors ?? []) names.add(row.name);
    return withCurrent(toOptions([...names]), form.sector);
  }, [lookups.sectors, form.sector]);

  const taxOfficeOptions = useMemo(() => {
    const rows = taxOffices.data ?? [];
    const city = form.city.trim().toLocaleLowerCase('tr');
    const sorted = rows.length
      ? [...rows]
          .sort((a, b) => Number((b.province ?? '').toLocaleLowerCase('tr') === city) - Number((a.province ?? '').toLocaleLowerCase('tr') === city))
          .map((row) => ({ value: row.name, label: row.name, hint: row.province }))
      : toOptions(TAX_OFFICE_OPTIONS);
    return withCurrent(sorted, form.taxOffice);
  }, [taxOffices.data, form.city, form.taxOffice]);

  const districtOptions = withCurrent(toOptions(isTurkey ? DISTRICTS_BY_PROVINCE[form.city] ?? [] : []), form.district);
  const hasCoordinates = form.latitude != null && form.longitude != null;

  const toggleDivision = (id: string) =>
    onChange({
      divisionIds: form.divisionIds.includes(id) ? form.divisionIds.filter((item) => item !== id) : [...form.divisionIds, id],
    });

  return (
    <View className="gap-4">
      <ChoiceChips
        label="Firma şekli"
        options={[
          { value: 'company', label: 'Kurumsal' },
          { value: 'person', label: 'Bireysel' },
        ]}
        value={form.companyType}
        onChange={(companyType) => onChange({ companyType })}
      />
      <ChoiceChips
        label="Firma Tipi *"
        options={FIRM_TYPE_OPTIONS}
        value={form.firmType}
        onChange={(firmType) =>
          onChange({ firmType, supplierCategoryCode: needsSupplierCategory(firmType) ? form.supplierCategoryCode : '' })
        }
      />
      {needsSupplierCategory(form.firmType) ? (
        <ChoiceChips
          label="Tedarikçi Türü *"
          options={SUPPLIER_CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.helper }))}
          value={form.supplierCategoryCode}
          onChange={(supplierCategoryCode) => onChange({ supplierCategoryCode })}
          error={errors.supplierCategoryCode}
        />
      ) : null}
      <ChoiceChips
        label="Firma Statüsü"
        options={SALES_STATUS_OPTIONS}
        value={form.salesStatus}
        onChange={(salesStatus) => onChange({ salesStatus })}
      />
      {divisionOptions.length > 0 ? (
        <ChoiceChips
          label="Bağlı Bulunduğu Birim *"
          options={divisionOptions}
          value={form.divisionIds}
          onChange={toggleDivision}
          error={errors.divisionIds}
          multi
        />
      ) : (
        <View className="gap-1">
          <Text className="font-inter-medium text-sm text-foreground">Bağlı Bulunduğu Birim *</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            Hesabınıza CNC, Üniversal veya Sac İşleme birimi tanımlı değil. Yöneticinizden birim yetkisi isteyin.
          </Text>
          {errors.divisionIds ? <Text className="font-inter text-xs text-destructive">{errors.divisionIds}</Text> : null}
        </View>
      )}

      <OptionPicker
        label="Firma Grubu"
        icon="albums-outline"
        placeholder="Firma grubunu seçin"
        value={form.companyGroupCode || null}
        options={groupOptions}
        clearable
        onChange={(value) => onChange({ companyGroupCode: value ?? '' })}
      />
      <OptionPicker
        label="İrtibat Şekli / Kaynak"
        icon="megaphone-outline"
        placeholder="Seçin veya yazın..."
        value={form.contactSourceText ? null : form.contactSourceCode || null}
        displayValue={form.contactSourceText || undefined}
        options={sourceOptions}
        searchable
        allowFreeText
        clearable
        onChange={(value) => onChange({ contactSourceCode: value ?? '', contactSourceText: '' })}
        onFreeText={(text) => onChange({ contactSourceText: text, contactSourceCode: '' })}
      />
      <OptionPicker
        label="Firma Sektörü"
        icon="business-outline"
        placeholder="Sektör seçin..."
        value={form.sector || null}
        options={sectorOptions}
        searchable
        allowFreeText
        clearable
        onChange={(value) => onChange({ sector: value ?? '' })}
        onFreeText={(sector) => onChange({ sector })}
      />

      <Field
        label={isPerson ? 'Ad Soyad *' : 'Firma Ünvanı *'}
        value={form.legalTitle}
        onChangeText={(legalTitle) => onChange({ legalTitle })}
        error={errors.legalTitle}
        maxLength={255}
        autoFocus={mode === 'create'}
      />
      {mode === 'edit' && !isPerson ? (
        <Field label="Kısa Ad" value={form.shortName} onChangeText={(shortName) => onChange({ shortName })} maxLength={128} />
      ) : null}
      <Field label="Telefon-1" placeholder="+90 ..." value={form.phone} onChangeText={(phone) => onChange({ phone })} keyboardType="phone-pad" />
      <Field label="Telefon-2" placeholder="+90 ..." value={form.phone2} onChangeText={(phone2) => onChange({ phone2 })} keyboardType="phone-pad" />
      <Field label="Faks" placeholder="+90 ..." value={form.fax} onChangeText={(fax) => onChange({ fax })} keyboardType="phone-pad" />
      <Field
        label={mode === 'edit' ? 'E-posta-1' : 'Mail-1'}
        value={form.email}
        onChangeText={(email) => onChange({ email })}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label={mode === 'edit' ? 'E-posta-2' : 'Mail-2'}
        value={form.email2}
        onChangeText={(email2) => onChange({ email2 })}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label="Web Sitesi"
        placeholder="https://..."
        value={form.website}
        onChangeText={(website) => onChange({ website })}
        keyboardType="url"
        autoCapitalize="none"
      />
      <WebsiteLookupPanel
        query={form.legalTitle}
        website={form.website}
        address={form.address}
        city={form.city}
        district={form.district}
        country={form.country}
        onApply={(suggestion) => {
          const next = applyWebsiteSuggestion(form, suggestion);
          onChange(next);
          toast.success('Site önerileri forma uygulandı');
        }}
      />

      {mode === 'create' ? (
        <OptionPicker
          label="Adres Türü"
          icon="home-outline"
          value={form.addressType}
          options={ADDRESS_TYPE_OPTIONS}
          onChange={(value) => onChange({ addressType: (value ?? 'office') as CompanyFormState['addressType'] })}
        />
      ) : null}
      <Field
        label="Açık Adres"
        value={form.address}
        onChangeText={(address) => onChange({ address })}
        multiline
        maxLength={1000}
        className="min-h-[72px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
      />
      <OptionPicker
        label="Ülke"
        icon="earth-outline"
        value={form.country || null}
        options={withCurrent(toOptions(COUNTRY_OPTIONS), form.country)}
        searchable
        allowFreeText
        onChange={(value) => onChange({ country: value ?? 'Türkiye', city: '', district: '' })}
        onFreeText={(country) => onChange({ country, city: '', district: '' })}
      />
      <OptionPicker
        label="İl"
        icon="map-outline"
        placeholder={isTurkey ? 'İl seçin veya yazın...' : 'İl yazın...'}
        value={form.city || null}
        options={withCurrent(toOptions(isTurkey ? PROVINCES : []), form.city)}
        searchable
        allowFreeText
        clearable
        onChange={(value) => onChange({ city: value ?? '', district: '' })}
        onFreeText={(city) => onChange({ city, district: '' })}
      />
      <OptionPicker
        label="İlçe"
        icon="navigate-outline"
        placeholder={!form.city ? 'Önce il seçin...' : districtOptions.length ? 'İlçe seçin veya yazın...' : 'İlçe yazın...'}
        value={form.district || null}
        options={districtOptions}
        searchable
        allowFreeText
        clearable
        onChange={(value) => onChange({ district: value ?? '' })}
        onFreeText={(district) => onChange({ district })}
      />
      <OsmSearchPanel
        query={form.legalTitle}
        address={form.address}
        city={form.city}
        district={form.district}
        country={form.country}
        onSelect={(result) => {
          onChange({
            latitude: result.latitude,
            longitude: result.longitude,
            address: form.address.trim() ? form.address : result.displayName,
          });
          toast.success(`Konum seçildi · ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`);
        }}
      />
      {hasCoordinates ? (
        <View className="flex-row items-center gap-2 rounded-control border border-success-border bg-success-soft px-3 py-2">
          <Text className="flex-1 font-inter text-xs text-foreground">
            {mode === 'create' ? 'Harita konumu kayda eklenecek' : 'Harita konumu'}: {form.latitude!.toFixed(5)}, {form.longitude!.toFixed(5)}
          </Text>
        </View>
      ) : null}

      <OptionPicker
        label="Vergi Dairesi"
        icon="receipt-outline"
        placeholder="Vergi dairesi seçin..."
        value={form.taxOffice || null}
        options={taxOfficeOptions}
        searchable
        allowFreeText
        clearable
        onChange={(value) => onChange({ taxOffice: value ?? '' })}
        onFreeText={(taxOffice) => onChange({ taxOffice })}
      />
      <Field
        label="T.C. / Vergi Kimlik Numarası"
        value={form.taxNumber}
        onChangeText={(taxNumber) => onChange({ taxNumber })}
        keyboardType="number-pad"
        maxLength={32}
      />
      <Field
        label="Notlar"
        value={form.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        numberOfLines={4}
        maxLength={4000}
        className="min-h-[96px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
      />
    </View>
  );
}
