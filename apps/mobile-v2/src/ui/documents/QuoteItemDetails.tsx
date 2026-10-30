import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useAllProducts, useSpecTemplates } from '@/src/api/products.hooks';
import { useCompany, useCompanyList } from '@/src/api/companies.hooks';
import { SearchSelect, type RemoteOptions } from '@/src/ui/select/SearchSelect';
import { MultiOptionPicker } from '@/src/ui/pickers/OptionPicker';
import { Button, Field, SubtleCard } from '@/src/ui';
import { ChoiceChips, ProductPickerSheet } from './pickers';
import type { EditableQuoteItem, QuoteOptionChildDraft, QuoteTechnicalSpecDraft } from './quote-logic';
import { updateQuotedTechnicalSpecs, removeQuoteOption } from './quote-configuration';

function useRemoteSuppliers(search: string): RemoteOptions<unknown> {
  const suppliers = useCompanyList({ search: search || undefined, relationTypeCode: 'supplier' });
  const mixed = useCompanyList({ search: search || undefined, relationTypeCode: 'supplier_customer' });
  return { items: [...(suppliers.data?.items ?? []), ...(mixed.data?.items ?? [])].map(company => ({ id: company.id, label: company.shortName || company.legalTitle })), isPending: suppliers.isPending || mixed.isPending, error: suppliers.error || mixed.error, refetch: () => { void suppliers.refetch(); void mixed.refetch(); }, hasNextPage: suppliers.hasNextPage || mixed.hasNextPage, isFetchingNextPage: suppliers.isFetchingNextPage || mixed.isFetchingNextPage, fetchNextPage: () => { if (suppliers.hasNextPage) void suppliers.fetchNextPage(); if (mixed.hasNextPage) void mixed.fetchNextPage(); } };
}
function SupplierRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const company = useCompany(id);
  return <Button variant="ghost" label={`${company.data?.shortName || company.data?.legalTitle || 'Kayıtlı tedarikçi'} · Kaldır`} onPress={onRemove} />;
}

const CONTROL_UNITS = ['FANUC', 'FANUC 0i-MF', 'FANUC 31i', 'SIEMENS 828D', 'SIEMENS 840D', 'MITSUBISHI', 'HEIDENHAIN', 'FAGOR', 'OKUMA OSP', 'MAZAK MAZATROL', 'SYNTEC', 'DELEM'];

export function QuoteItemDetails({ item, currencyCode, vatEnabled, divisionId, onChange }: { item: EditableQuoteItem; currencyCode: string; vatEnabled: boolean; divisionId?: string | null; onChange: (patch: Partial<EditableQuoteItem>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const products = useAllProducts(expanded);
  const templates = useSpecTemplates(item.productTypeCode, divisionId ?? undefined);
  const optionalSheet = useRef<BottomSheetModal>(null);
  const compatible = /OPSIYONEL_DONANIM|YEDEK_PARCA/i.test(item.categoryCode ?? '') || Object.values(item.compatibilityFilters).some(values => values.length);
  const options = item.optionChildren;
  const patchOption = (key: string, patch: Partial<QuoteOptionChildDraft>) => onChange({ optionChildren: options.map(row => row.key === key ? { ...row, ...patch } : row) });
  const changeSpecs = (next: QuoteTechnicalSpecDraft[]) => onChange(updateQuotedTechnicalSpecs(item, next));
  const setCompat = (key: keyof EditableQuoteItem['compatibilityFilters'], values: string[]) => onChange({ compatibilityFilters: { ...item.compatibilityFilters, [key]: values } });
  const scoped = (products.data ?? []).filter(product => !divisionId || !product.divisionId || product.divisionId === divisionId);
  const withSaved = (values: string[], rows: { value: string; label: string }[]) => [...rows, ...values.filter(value => !rows.some(row => row.value === value)).map(value => ({ value, label: value }))];
  function addOption(description = '', unitPrice = '', productId?: string) {
    onChange({ optionChildren: [...options, { key: `manual-${Date.now()}-${options.length}`, ...(productId ? { productModelId: productId } : {}), description, quantity: item.quantity || '1', unitPrice, discount: '', discountType: 'amount', vatRate: item.vatRate }] });
  }
  return <View className="gap-2">
    <Button variant="ghost" label={expanded ? 'Teknik bilgi ve opsiyonları kapat' : `Teknik bilgi ve opsiyonlar (${item.technicalSpecs.length} / ${options.length})`} onPress={() => setExpanded(value => !value)} />
    {expanded ? <View className="gap-3">
      <Text className="font-inter-semibold text-sm text-foreground">Teknik özellikler</Text>
      <Text className="font-inter text-xs text-muted-foreground">Bu değişiklikler yalnızca teklife uygulanır.</Text>
      {item.technicalSpecs.map((spec, index) => {
        const locked = (templates.data ?? []).some(template => template.specKey.trim().toLocaleLowerCase('tr') === spec.key.trim().toLocaleLowerCase('tr'));
        const update = (patch: Partial<QuoteTechnicalSpecDraft>) => changeSpecs(item.technicalSpecs.map((row, i) => i === index ? { ...row, ...patch } : row));
        return <SubtleCard key={index} className="gap-2 p-2">
          <Field label={`Özellik ${index + 1}`} value={spec.key} editable={!locked && !templates.isPending} onChangeText={key => update({ key })} maxLength={255} />
          <Field label="Değer" value={spec.value} onChangeText={value => update({ value })} maxLength={2000} multiline />
          <Text className="font-inter text-xs text-muted-foreground">Birim: {spec.unit || '—'}</Text>
          {!locked ? <Button variant="ghost" label="Özelliği kaldır" disabled={templates.isPending || Boolean(templates.error)} onPress={() => changeSpecs(item.technicalSpecs.filter((_, i) => i !== index))} /> : null}
        </SubtleCard>;
      })}
      <Button variant="ghost" label="Teknik özellik ekle" onPress={() => changeSpecs([...item.technicalSpecs, { key: '', value: '' }])} />
      <Text className="font-inter-semibold text-sm text-foreground">Opsiyonel donanımlar</Text>
      {options.map((child, index) => <SubtleCard key={child.key} className="gap-2 p-2">
        <Text className="font-inter-semibold text-xs text-foreground">Opsiyon {index + 1}</Text>
        <Field label="Açıklama" value={child.description} onChangeText={description => patchOption(child.key, { description })} multiline maxLength={1980} />
        <View className="flex-row gap-2"><View className="flex-1"><Field label="Adet" value={child.quantity} onChangeText={quantity => patchOption(child.key, { quantity })} keyboardType="decimal-pad" /></View><View className="flex-1"><Field label={`Birim fiyat (${currencyCode})`} value={child.unitPrice} onChangeText={unitPrice => patchOption(child.key, { unitPrice })} keyboardType="decimal-pad" /></View></View>
        <ChoiceChips label="İskonto tipi" value={child.discountType} options={[{ value: 'amount', label: 'Tutar' }, { value: 'percent', label: 'Oran %' }]} onChange={value => patchOption(child.key, { discountType: value as 'amount' | 'percent' })} />
        <Field label={child.discountType === 'percent' ? 'İskonto %' : `İskonto (${currencyCode})`} value={child.discount} onChangeText={discount => patchOption(child.key, { discount })} keyboardType="decimal-pad" />
        <Field label="KDV %" value={vatEnabled ? child.vatRate : '0'} editable={vatEnabled} onChangeText={vatRate => patchOption(child.key, { vatRate })} keyboardType="decimal-pad" />
        <Button variant="ghost" label="Opsiyonu kaldır" onPress={() => onChange(removeQuoteOption(item, child.key))} />
      </SubtleCard>)}
      <Button variant="ghost" label="Serbest opsiyon ekle" onPress={() => addOption()} />
      <Button variant="ghost" label="Katalogdan opsiyon ekle" onPress={() => optionalSheet.current?.present()} />
      {compatible ? <View className="gap-2">
        <Text className="font-inter-semibold text-sm text-foreground">Uyumluluk</Text>
        {products.error ? <Button variant="ghost" label="Uyumluluk kataloğunu yeniden yükle" onPress={() => void products.refetch()} /> : null}
        <MultiOptionPicker label="Uyumlu makineler" values={item.compatibilityFilters.machineIds} options={withSaved(item.compatibilityFilters.machineIds, scoped.filter(product => /TEZGAH/i.test(product.category?.code ?? '')).map(product => ({ value: product.id, label: product.fullName })))} onChange={values => setCompat('machineIds', values)} />
        <MultiOptionPicker label="Uyumlu markalar" values={item.compatibilityFilters.brands} options={withSaved(item.compatibilityFilters.brands, [...new Set(scoped.map(product => product.brand?.name).filter((name): name is string => Boolean(name)))].map(name => ({ value: name, label: name })))} onChange={values => setCompat('brands', values)} />
        <MultiOptionPicker label="Kontrol üniteleri" values={item.compatibilityFilters.controlUnits} options={withSaved(item.compatibilityFilters.controlUnits, CONTROL_UNITS.map(value => ({ value, label: value })))} onChange={values => setCompat('controlUnits', values)} />
        {item.compatibilityFilters.supplierIds.map(id => <SupplierRow key={id} id={id} onRemove={() => setCompat('supplierIds', item.compatibilityFilters.supplierIds.filter(value => value !== id))} />)}
        <SearchSelect label="Uyumlu tedarikçi ekle" placeholder="Tedarikçi seçin" icon="business-outline" value="" useRemote={useRemoteSuppliers} onSelect={company => { if (company) setCompat('supplierIds', [...new Set([...item.compatibilityFilters.supplierIds, company.id])]); }} />
      </View> : null}
    </View> : null}
    <ProductPickerSheet sheetRef={optionalSheet} onSelect={product => addOption(product.fullName, product.listPrice ? String(Number(product.listPrice)) : '0', product.id)} />
  </View>;
}
