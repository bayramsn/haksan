import { Text, View } from 'react-native';
import { Field } from '@/src/ui';
import { PillGroup } from '@/src/ui/sales/Sheet';
import { LOST_REASONS, type LostInput } from '@/src/ui/sales/sales-logic';

export const EMPTY_LOST_INPUT: LostInput = { reasonCode: null, productName: '', unmetConditions: '', competitorName: '', competitorModel: '' };

/** Web LostCaseDialog'unun zorunlu alanları (kayıp nedeni, ürün, karşılanamayan şartlar). */
export function LostCaseFields({
  value,
  onChange,
  productPlaceholder,
}: {
  value: LostInput;
  onChange: (next: LostInput) => void;
  productPlaceholder?: string | null;
}) {
  return (
    <View className="gap-3">
      <Text className="font-inter text-xs text-muted-foreground">
        Müşteri yalnızca ileri bir tarih verdiyse kayıp seçmeyin; karttaki “Takibe Al” işlemi fırsatı açık tutar ve görev oluşturur.
      </Text>
      <PillGroup
        label="Kayıp Nedeni *"
        tone="destructive"
        options={LOST_REASONS.map((reason) => ({ value: reason.code, label: reason.name }))}
        value={value.reasonCode}
        onChange={(reasonCode) => onChange({ ...value, reasonCode })}
      />
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
      <Field
        label="Rakip firma (opsiyonel)"
        value={value.competitorName}
        onChangeText={(competitorName) => onChange({ ...value, competitorName })}
        placeholder="Örn. Şahintek Makina"
        maxLength={255}
      />
      <Field
        label="Rakip ürün/model (opsiyonel)"
        value={value.competitorModel}
        onChangeText={(competitorModel) => onChange({ ...value, competitorModel })}
        maxLength={255}
      />
    </View>
  );
}
