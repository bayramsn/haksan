import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';

/** Record identity and financial value stay distinct, even at large accessibility text sizes. */
export function RecordHero({ title, subtitle, amount, amountLabel, reference, icon = 'receipt-outline', children }: {
  title: string; subtitle?: string; amount?: string; amountLabel?: string; reference?: string;
  icon?: keyof typeof Ionicons.glyphMap; children?: ReactNode;
}) {
  const { colors } = useTheme();
  return <View className="gap-4 rounded-surface border border-border bg-card p-5">
    <View className="flex-row items-start gap-3"><View className="h-11 w-11 items-center justify-center rounded-control bg-secondary"><Ionicons name={icon} size={22} color={colors.primary} /></View><View className="min-w-0 flex-1 gap-1">{reference ? <Text className="font-inter-medium text-[12px] text-muted-foreground" selectable>{reference}</Text> : null}<Text className="font-inter-semibold text-[20px] leading-[28px] text-foreground" selectable>{title}</Text>{subtitle ? <Text className="font-inter text-[13px] leading-5 text-muted-foreground">{subtitle}</Text> : null}</View></View>
    {amount ? <View className="gap-1 rounded-control bg-secondary p-4"><Text className="font-inter-medium text-[12px] text-muted-foreground">{amountLabel ?? 'Genel toplam'}</Text><Text className="font-inter-bold text-[28px] leading-[36px] text-primary" style={{ fontVariant: ['tabular-nums'] }} selectable>{amount}</Text></View> : null}
    {children}
  </View>;
}
