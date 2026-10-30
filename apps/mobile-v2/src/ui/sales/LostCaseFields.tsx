import { Text, View } from 'react-native';
import { useCan } from '@/src/auth/AuthProvider';
import { useCompetitors, useCreateCompetitor } from '@/src/api/competitors.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { PillGroup } from '@/src/ui/sales/Sheet';
import { LOST_REASONS, type LostInput } from '@/src/ui/sales/sales-logic';

export { EMPTY_LOST_INPUT } from '@/src/ui/sales/sales-logic';

/**
 * Web CloseCaseDialog rakip seçimi: kayıtlı rakiplerden seç, yoksa elle yaz.
 * Yetki varsa elle yazılan ad rakip listesine eklenip seçilir; böylece aynı
 * rakip farklı yazımlarla dağılmaz.
 */
function CompetitorPicker({ value, onChange }: { value: LostInput; onChange: (next: LostInput) => void }) {
  const name = value.competitorName.trim();
  const search = useDebouncedValue(value.competitorId ? '' : name);
  const competitors = useCompetitors(search);
  const create = useCreateCompetitor();
  const canCreate = useCan('competitors.create');
  const rows = competitors.data?.data ?? [];
  const options = rows.map((row) => ({ value: row.id, label: row.name }));
  // Seçili rakip sonraki aramada listeden düşse de pill görünür kalsın.
  if (value.competitorId && !rows.some((row) => row.id === value.competitorId)) {
    options.unshift({ value: value.competitorId, label: value.competitorName });
  }
  const exactMatch = rows.some((row) => row.name.trim().toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));

  function addCompetitor() {
    create.mutate(
      { name },
      {
        onSuccess: (row) => onChange({ ...value, competitorId: row.id, competitorName: row.name }),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <View className="gap-2">
      <Field
        label="Rakip firma (opsiyonel)"
        value={value.competitorName}
        onChangeText={(competitorName) => onChange({ ...value, competitorName, competitorId: null })}
        placeholder="Ara veya yaz: Örn. Şahintek Makina"
        maxLength={255}
      />
      {options.length ? (
        <PillGroup
          options={options}
          value={value.competitorId ?? null}
          onChange={(id) => {
            const row = options.find((option) => option.value === id);
            onChange({ ...value, competitorId: id, competitorName: row?.label ?? value.competitorName });
          }}
        />
      ) : null}
      {competitors.isError ? (
        <Text className="font-inter text-xs text-muted-foreground">Rakip listesi yüklenemedi; adı elle yazabilirsiniz.</Text>
      ) : null}
      {name && !value.competitorId && !exactMatch && canCreate && !competitors.isFetching ? (
        <Button
          label={`“${name}” rakip listesine ekle`}
          variant="ghost"
          loading={create.isPending}
          disabled={create.isPending}
          onPress={addCompetitor}
        />
      ) : null}
    </View>
  );
}

/** Web LostCaseDialog'unun zorunlu alanları (kayıp nedeni, ürün, karşılanamayan şartlar). */
export function LostCaseFields({
  value,
  onChange,
  productPlaceholder,
  hideReason,
}: {
  value: LostInput;
  onChange: (next: LostInput) => void;
  productPlaceholder?: string | null;
  /** CloseCase sheet zaten neden seçtiriyorsa tekrar göstermeyin. */
  hideReason?: boolean;
}) {
  return (
    <View className="gap-3">
      <Text className="font-inter text-xs text-muted-foreground">
        Müşteri yalnızca ileri bir tarih verdiyse kayıp seçmeyin; karttaki “Takibe Al” işlemi fırsatı açık tutar ve görev oluşturur.
      </Text>
      {hideReason ? null : (
        <PillGroup
          label="Kayıp Nedeni *"
          tone="destructive"
          options={LOST_REASONS.map((reason) => ({ value: reason.code, label: reason.name }))}
          value={value.reasonCode}
          onChange={(reasonCode) => onChange({ ...value, reasonCode })}
        />
      )}
      <Field
        label="Kaybedilen ürün *"
        value={value.productName}
        onChangeText={(productName) => onChange({ ...value, productName })}
        placeholder={productPlaceholder ?? 'Örn. VM-2 Dikey İşleme Merkezi'}
        maxLength={512}
      />
      <Field
        label="Karşılanamayan şartlar *"
        value={value.unmetConditions}
        onChangeText={(unmetConditions) => onChange({ ...value, unmetConditions })}
        placeholder="Örn. teslim süresi 6 ay istendi, 4 ay karşılanamadı"
        multiline
        numberOfLines={2}
        maxLength={2000}
      />
      <CompetitorPicker value={value} onChange={onChange} />
      <Field
        label="Rakip ürün/model (opsiyonel)"
        value={value.competitorModel}
        onChangeText={(competitorModel) => onChange({ ...value, competitorModel })}
        maxLength={255}
      />
    </View>
  );
}
