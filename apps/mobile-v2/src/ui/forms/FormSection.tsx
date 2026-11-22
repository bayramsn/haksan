import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';

/** Keeps the input tree mounted so collapsing never discards edits or ongoing configuration. */
export function FormSection({ title, hint, icon = 'document-text-outline', children, collapsible = false, initiallyOpen = true, hasError = false }: {
  title: string; hint?: string; icon?: keyof typeof Ionicons.glyphMap; children: ReactNode;
  collapsible?: boolean; initiallyOpen?: boolean; hasError?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => { if (hasError) setOpen(true); }, [hasError]);
  const expanded = !collapsible || open || hasError;
  const heading = <>
    <View className="h-10 w-10 items-center justify-center rounded-control bg-secondary"><Ionicons name={icon} size={20} color={colors.primary} /></View>
    <View className="min-w-0 flex-1 gap-1"><Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">{title}</Text>{hint ? <Text className="font-inter text-[12px] leading-[18px] text-muted-foreground">{hint}</Text> : null}</View>
    {collapsible ? <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} /> : null}
  </>;
  return <View className={`overflow-hidden rounded-surface border bg-card ${hasError ? 'border-destructive' : 'border-border'}`}>
    {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} onPress={() => setOpen(value => !value)} className="min-h-16 flex-row items-center gap-3 p-4">{heading}</Pressable> : <View className="flex-row items-center gap-3 p-4">{heading}</View>}
    <View style={expanded ? undefined : { display: 'none' }} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} className="gap-4 px-4 pb-4">{children}</View>
  </View>;
}
