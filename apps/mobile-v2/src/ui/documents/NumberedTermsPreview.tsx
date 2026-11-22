import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/src/ui';
import { markedTerms } from './numbered-terms';
export function NumberedTermsPreview({ values, style }: { values: { label: string; value: string }[]; style: 'alpha' | 'decimal' }) {
  const [open, setOpen] = useState(false);
  let start = 0;
  return <View className="gap-2">
    <Button label={open ? 'Madde önizlemesini gizle' : 'Belgedeki madde sırasını göster'} variant="ghost" onPress={() => setOpen(current => !current)} />
    {open ? values.map(({label,value}) => {
      const rows = markedTerms(value, style, start); start += rows.length;
      return <View key={label} className="gap-1.5 rounded-control border border-border bg-card p-3">
        <Text className="font-inter-semibold text-sm text-foreground">{label}</Text>
        {rows.length ? rows.map((row, index) => <View key={index} className="flex-row gap-2"><Text className="min-w-6 font-inter text-sm text-muted-foreground">{row.marker}</Text><Text selectable className="flex-1 font-inter text-sm text-foreground">{row.text}</Text></View>) : <Text className="font-inter text-sm text-muted-foreground">Madde yok.</Text>}
      </View>;
    }) : null}
  </View>;
}
