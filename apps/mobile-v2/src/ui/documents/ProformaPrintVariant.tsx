import { Text, View } from 'react-native';
import { PROFORMA_NOTE_OPTIONS } from '@haksan/shared/dist/commercial-print/notes';
import { SearchSelect } from '@/src/ui/select/SearchSelect';

const options = [
  { id: '', label: 'Otomatik (teklife göre)' },
  ...PROFORMA_NOTE_OPTIONS.map(item => ({ id: item.key, label: item.label, hint: item.group === 'proforma' ? 'Proforma şablonu' : 'Teklif teslim şekli' })),
];

export function ProformaPrintVariant({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <View className="gap-1">
    <SearchSelect label="Çıktı Şablonu" placeholder="Otomatik (teklife göre)" icon="document-text-outline"
      value={options.find(item => item.id === value)?.label ?? 'Otomatik (teklife göre)'}
      selectedId={value} options={options} clearable={false} onSelect={item => onChange(item?.id ?? '')} />
    <Text className="font-inter text-xs text-muted-foreground">Yalnızca PDF çıktısında kullanılır; kayıtlı belge şartlarını değiştirmez.</Text>
  </View>;
}
