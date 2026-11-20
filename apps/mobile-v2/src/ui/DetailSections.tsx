import { Pressable, Text, View } from 'react-native';

export type DetailSection = 'summary' | 'process' | 'records';
const sections: { key: DetailSection; label: string }[] = [
  { key: 'summary', label: 'Özet' }, { key: 'process', label: 'Süreç' }, { key: 'records', label: 'Kayıtlar' },
];

/** Aynı kayıt bağlamını koruyan, liste ve detaylardan bağımsız içerik hiyerarşisi. */
export function DetailSections({ value, onChange }: { value: DetailSection; onChange: (value: DetailSection) => void }) {
  return <View accessibilityRole="tablist" className="mx-4 my-2 flex-row rounded-control border border-border bg-card p-1">
    {sections.map(section => <Pressable key={section.key} accessibilityRole="tab" accessibilityState={{ selected: value === section.key }}
      onPress={() => onChange(section.key)} className={`min-h-11 flex-1 items-center justify-center rounded-control ${value === section.key ? 'bg-primary' : ''}`}>
      <Text className={`font-inter-semibold text-sm ${value === section.key ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{section.label}</Text>
    </Pressable>)}
  </View>;
}
