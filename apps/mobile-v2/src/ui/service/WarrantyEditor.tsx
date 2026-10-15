import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerDevice, ProductModel, WarrantyClaim, WarrantyPartInput } from '@/src/api/endpoints';
import {
  useDecideWarranty,
  useServiceWarranty,
  useSetWarrantyParts,
  useSubmitWarranty,
  useUpdateWarrantyAssessment,
} from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Chip, ErrorState, Field, Loading, Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanySelect } from '@/src/ui/select/fields';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ChoiceChips, FormSection, ProductPicker } from './fields';
import { CURRENCIES, type Currency } from './serviceForms';
import { WARRANTY_STATUS_LABELS } from './serviceStage';

/** warrantyResponse tam satırı; mobil `WarrantyClaim` tipinde olmayan alanlar burada okunur. */
type ClaimDetail = Omit<WarrantyClaim, 'parts'> & {
  coverageSuggestion?: string | null;
  coverageDecision?: string | null;
  managerDecisionNote?: string | null;
  warrantyStartSnapshot?: string | null;
  warrantyEndSnapshot?: string | null;
  parts: (WarrantyClaim['parts'][number] & {
    productModelId?: string | null;
    source?: string | null;
    notes?: string | null;
    product?: { id: string; model: string | null; modelName: string | null } | null;
  })[];
};

type ClaimStatus = WarrantyClaim['status'];
const STATUS_OPTIONS = Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => ({ value: value as ClaimStatus, label }));
const SUGGESTION_LABELS: Record<string, string> = { in_warranty: 'Garanti içi', out_of_warranty: 'Garanti dışı', unknown: 'Bilinmiyor' };
const DECISION_LABELS: Record<string, string> = { pending: 'Karar bekliyor', approved: 'Kapsam içi', rejected: 'Kapsam dışı' };
const ACTION_OPTIONS = [
  { value: 'replace', label: 'Değişim' },
  { value: 'repair', label: 'Tamir' },
  { value: 'return', label: 'İade' },
  { value: 'investigate', label: 'İnceleme' },
] as const;
const SOURCE_OPTIONS = [
  { value: 'stock', label: 'Stok' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'customer', label: 'Müşteri' },
  { value: 'service', label: 'Servis' },
] as const;
type PartAction = (typeof ACTION_OPTIONS)[number]['value'];
type PartSource = (typeof SOURCE_OPTIONS)[number]['value'];
const actionLabel = (value: string | null | undefined) => ACTION_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';
const sourceLabel = (value: string | null | undefined) => SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';

function toPartInput(part: ClaimDetail['parts'][number]): WarrantyPartInput {
  return {
    description: part.description,
    quantity: Number(part.quantity) || 1,
    actionType: part.actionType ?? undefined,
    source: part.source ?? undefined,
    productModelId: part.productModelId ?? undefined,
    chargeToCustomer: Boolean(part.chargeToCustomer),
    unitCost: part.unitCost,
    currency: part.currency ?? undefined,
    supplierRmaStatus: part.supplierRmaStatus,
    notes: part.notes ?? null,
  };
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="min-w-[46%] flex-1 gap-1.5 rounded-control border border-border bg-card px-3 py-2.5">
      <Text className="font-inter text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

export function WarrantyEditor({ ticketId, device, canUpdate }: { ticketId: string; device: CustomerDevice | null; canUpdate: boolean }) {
  const { colors } = useTheme();
  const warranty = useServiceWarranty(ticketId);
  const save = useUpdateWarrantyAssessment(ticketId);
  const submit = useSubmitWarranty(ticketId);
  const decide = useDecideWarranty(ticketId);
  const setParts = useSetWarrantyParts(ticketId);
  const canApprove = useCan('service_tickets.approve');
  const canReject = useCan('service_tickets.reject');
  const claim = (warranty.data ?? null) as ClaimDetail | null;

  const [failureCategory, setFailureCategory] = useState('');
  const [rmaNo, setRmaNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierStatus, setSupplierStatus] = useState('');
  const [assessment, setAssessment] = useState('');
  const [cost, setCost] = useState('');
  const [charge, setCharge] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [decisionNote, setDecisionNote] = useState('');

  const [partDescription, setPartDescription] = useState('');
  const [partProduct, setPartProduct] = useState<ProductModel | null>(null);
  const [partQty, setPartQty] = useState('1');
  const [partAction, setPartAction] = useState<PartAction>('replace');
  const [partSource, setPartSource] = useState<PartSource>('stock');
  const [partCharge, setPartCharge] = useState(false);

  const claimId = claim?.id;
  useEffect(() => {
    if (!claim) return;
    setFailureCategory(claim.failureCategory ?? '');
    setRmaNo(claim.rmaNo ?? '');
    setSupplierName(claim.supplierName ?? '');
    setSupplierStatus(claim.supplierRmaStatus ?? '');
    setAssessment(claim.technicianAssessment ?? '');
    setCost(claim.costAmount ?? '');
    setCharge(claim.customerChargeAmount ?? '');
    const code = (claim.costCurrency ?? claim.customerChargeCurrency ?? 'TRY') as Currency;
    setCurrency(CURRENCIES.includes(code) ? code : 'TRY');
    // Yalnız farklı garanti dosyası yüklendiğinde formu tazele; yazarken üzerine yazma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  if (warranty.isPending) return <Loading />;
  if (warranty.error) return <ErrorState message={warranty.error.message} onRetry={() => void warranty.refetch()} />;
  if (!claim) return null;

  const busy = save.isPending || submit.isPending || decide.isPending || setParts.isPending;
  const fail = (title: string) => (error: Error) => toast.error(`${title}: ${error.message}`);
  const warrantyStart = device?.warrantyStartDate ?? claim.warrantyStartSnapshot ?? null;
  const warrantyEnd = device?.warrantyEndDate ?? claim.warrantyEndSnapshot ?? null;
  const expired = Boolean(device?.warrantyEndDate && new Date(device.warrantyEndDate).getTime() < Date.now());
  const suggestion = claim.coverageSuggestion ?? 'unknown';
  const decision = claim.coverageDecision ?? 'pending';

  const saveAssessment = () =>
    save.mutate(
      {
        failureCategory,
        technicianAssessment: assessment,
        rmaNo,
        supplierName,
        supplierRmaStatus: supplierStatus,
        costAmount: cost ? Number(cost.replace(',', '.')) : null,
        costCurrency: currency,
        customerChargeAmount: charge ? Number(charge.replace(',', '.')) : null,
        customerChargeCurrency: currency,
      },
      { onSuccess: () => toast.success('Garanti dosyası kaydedildi'), onError: fail('Garanti dosyası kaydedilemedi') },
    );

  const addPart = () => {
    const description = partDescription.trim();
    if (!description) return;
    const next: WarrantyPartInput[] = [
      ...claim.parts.map(toPartInput),
      {
        description,
        productModelId: partProduct?.id,
        quantity: Math.max(1, Number(partQty) || 1),
        actionType: partAction,
        source: partSource,
        chargeToCustomer: partCharge,
        currency,
        unitCost: null,
        supplierRmaStatus: null,
        notes: null,
      },
    ];
    setParts.mutate(next, {
      onSuccess: () => {
        setPartDescription('');
        setPartProduct(null);
        setPartQty('1');
        setPartCharge(false);
        toast.success('Garanti parça satırı eklendi');
      },
      onError: fail('Parça satırı eklenemedi'),
    });
  };

  const removePart = (index: number) =>
    Alert.alert('Parça satırını kaldır', 'Bu garanti parça satırı kaldırılacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () =>
          setParts.mutate(claim.parts.filter((_, i) => i !== index).map(toPartInput), {
            onSuccess: () => toast.success('Garanti parça satırı kaldırıldı'),
            onError: fail('Parça satırı kaldırılamadı'),
          }),
      },
    ]);

  const runDecision = (kind: 'approved' | 'rejected') => {
    const go = () =>
      decide.mutate(
        { decision: kind, note: decisionNote.trim() || undefined },
        {
          onSuccess: () => {
            setDecisionNote('');
            toast.success(kind === 'approved' ? 'Garanti onaylandı' : 'Garanti reddedildi');
          },
          onError: fail('Garanti kararı kaydedilemedi'),
        },
      );
    if (kind === 'approved') return go();
    Alert.alert('Garantiyi reddet', 'Garanti kapsam dışı olarak işaretlenecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Reddet', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <Tile label="Süreç">
          <Chip tone="neutral" label={WARRANTY_STATUS_LABELS[claim.status] ?? claim.status} />
        </Tile>
        <Tile label="Sistem Önerisi">
          <Chip tone={suggestion === 'in_warranty' ? 'success' : suggestion === 'out_of_warranty' ? 'destructive' : 'neutral'} label={SUGGESTION_LABELS[suggestion] ?? suggestion} />
        </Tile>
        <Tile label="Yönetici Kararı">
          <Chip tone={decision === 'approved' ? 'success' : decision === 'rejected' ? 'destructive' : 'neutral'} label={DECISION_LABELS[decision] ?? decision} />
        </Tile>
        <Tile label="Garanti Aralığı">
          <Text className="font-inter text-sm text-foreground">
            {warrantyStart ? formatDate(warrantyStart) : '—'} / {warrantyEnd ? formatDate(warrantyEnd) : '—'}
          </Text>
        </Tile>
      </View>

      {canUpdate ? (
        <ChoiceChips
          label="Süreç durumu"
          value={claim.status}
          options={STATUS_OPTIONS}
          onChange={(status) =>
            save.mutate({ status }, { onSuccess: () => toast.success('Garanti durumu güncellendi'), onError: fail('Garanti durumu güncellenemedi') })
          }
        />
      ) : null}

      {!device ? (
        <View className="rounded-control border border-border bg-muted px-3 py-2.5">
          <Text className="font-inter text-sm text-foreground">
            Garanti dosyası taslak olarak tutulabilir; onaya göndermek için servis kaydını bir makineyle eşleştirin.
          </Text>
        </View>
      ) : null}
      {expired ? (
        <View className="flex-row gap-2 rounded-control border border-border bg-muted px-3 py-2.5">
          <Ionicons name="warning-outline" size={18} color={colors.destructive} />
          <Text className="flex-1 font-inter text-sm text-foreground">
            Makine garanti bitiş tarihi geçmiş görünüyor. Yönetici yine de istisna olarak garanti kapsamı onayı verebilir.
          </Text>
        </View>
      ) : null}

      <FormSection title="Garanti Değerlendirmesi">
        <Field label="Arıza Kategorisi" value={failureCategory} onChangeText={setFailureCategory} placeholder="Spindle, kontrol ünitesi, hidrolik..." editable={canUpdate} />
        <Field label="RMA No" value={rmaNo} onChangeText={setRmaNo} placeholder="Tedarikçi RMA numarası" editable={canUpdate} />
        <CompanySelect
          label="Tedarikçi"
          placeholder="Kayıtlı tedarikçiden seçin veya yazın"
          value={supplierName}
          onSelect={(item) => setSupplierName(item ? (item.data?.legalTitle ?? item.label) : '')}
          allowCustom
          clearable
          disabled={!canUpdate}
        />
        <Field label="Tedarikçi RMA Durumu" value={supplierStatus} onChangeText={setSupplierStatus} placeholder="Gönderildi, inceleniyor, kabul..." editable={canUpdate} />
        <Field
          label="Teknisyen Değerlendirmesi"
          value={assessment}
          onChangeText={setAssessment}
          placeholder="Arıza bulgusu, kapsam gerekçesi ve sahada yapılan kontroller"
          multiline
          editable={canUpdate}
          style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <View className="flex-row gap-2">
          <View className="flex-1"><Field label="Tedarikçi / Garanti Maliyeti" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0" editable={canUpdate} /></View>
          <View className="flex-1"><Field label="Müşteriye Yansıtılacak" value={charge} onChangeText={setCharge} keyboardType="decimal-pad" placeholder="0" editable={canUpdate} /></View>
        </View>
        <ChoiceChips label="Para" value={currency} options={CURRENCIES.map((code) => ({ value: code, label: code }))} onChange={setCurrency} />
        {canUpdate ? (
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              label="Onaya gönder"
              variant="ghost"
              disabled={busy || !device}
              onPress={() =>
                submit.mutate(undefined, {
                  onSuccess: () => toast.success('Garanti dosyası onaya gönderildi'),
                  onError: fail('Onaya gönderilemedi'),
                })
              }
            />
            <Button className="flex-1" label="Kaydet" loading={save.isPending} disabled={busy} onPress={saveAssessment} />
          </View>
        ) : null}
      </FormSection>

      {canApprove || canReject ? (
        <FormSection title="Yönetici Kararı">
          <Field label="Karar notu" value={decisionNote} onChangeText={setDecisionNote} placeholder="Karar notu" multiline style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
          {claim.managerDecisionNote ? (
            <View className="gap-1 rounded-control bg-muted px-3 py-2">
              <Text className="font-inter text-[11px] uppercase tracking-wide text-muted-foreground">Son karar notu</Text>
              <Text className="font-inter text-sm text-foreground">{claim.managerDecisionNote}</Text>
            </View>
          ) : null}
          <View className="flex-row gap-2">
            {canReject ? <Button className="flex-1" label="Reddet" variant="destructive" disabled={busy} onPress={() => runDecision('rejected')} /> : null}
            {canApprove ? <Button className="flex-1" label="Onayla" disabled={busy} loading={decide.isPending} onPress={() => runDecision('approved')} /> : null}
          </View>
        </FormSection>
      ) : null}

      <FormSection title="Garanti / RMA Parçaları">
        {canUpdate ? (
          <View className="gap-2">
            <ProductPicker
              label="Katalog Ürünü"
              placeholder="Opsiyonel"
              value={partProduct ? { id: partProduct.id, name: [partProduct.modelCode, partProduct.stockCode].filter(Boolean).join(' · ') } : null}
              categoryCodes={['YEDEK_PARCA', 'AKSESUAR']}
              onChange={(next) => {
                setPartProduct(next);
                if (next && !partDescription.trim()) setPartDescription(next.modelName ?? next.modelCode ?? next.fullName);
              }}
            />
            <Field label="Parça / İşlem" value={partDescription} onChangeText={setPartDescription} placeholder="Değişecek parça veya RMA işlemi" />
            <View className="w-28"><Field label="Adet" value={partQty} onChangeText={setPartQty} keyboardType="number-pad" /></View>
            <ChoiceChips label="İşlem" value={partAction} options={[...ACTION_OPTIONS]} onChange={setPartAction} />
            <ChoiceChips label="Kaynak" value={partSource} options={[...SOURCE_OPTIONS]} onChange={setPartSource} />
            <View className="min-h-[44px] flex-row items-center justify-between rounded-control border border-border px-3">
              <Text className="font-inter text-sm text-foreground">Ücretli</Text>
              <Switch accessibilityLabel="Ücretli" value={partCharge} onValueChange={setPartCharge} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
            <Button label="Ekle" disabled={busy || !partDescription.trim()} loading={setParts.isPending} onPress={addPart} />
          </View>
        ) : null}
        {claim.parts.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Garanti parça/RMA satırı yok.</Text> : null}
        {claim.parts.map((part, index) => (
          <View key={part.id ?? `${part.description}-${index}`} className="flex-row items-center gap-2 border-b border-border py-2.5">
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-medium text-[14px] text-foreground">{part.description}</Text>
              <Text className="font-inter text-[11px] text-muted-foreground">
                {[
                  part.product?.model ?? part.product?.modelName,
                  actionLabel(part.actionType),
                  sourceLabel(part.source),
                  `${Number(part.quantity)} adet`,
                  part.chargeToCustomer ? 'Müşteriye yansır' : 'Garanti/RMA',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {canUpdate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${part.description} satırını kaldır`}
                disabled={busy}
                onPress={() => removePart(index)}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="close" size={20} color={colors.destructive} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </FormSection>

      <FormSection title="Garanti Kanıtları ve Ekler">
        <AttachmentsPanel entityType="service_ticket" entityId={ticketId} canUpload={canUpdate} />
      </FormSection>
    </>
  );
}
