import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, ListSkeleton } from '@/src/ui';
import { ChoiceChips } from '@/src/ui/reports/parts';
import {
  CONNECTION_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  SYNC_STATUS_LABELS,
  metaStatusTone,
  type MetaConnection,
  type MetaConnectionStatus,
} from '@/src/ui/meta/metaNormalize';

type IconName = keyof typeof Ionicons.glyphMap;

export function MetaSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="font-display text-[18px] text-foreground">{title}</Text>
        {description ? <Text className="font-inter text-xs leading-[17px] text-muted-foreground">{description}</Text> : null}
      </View>
      {actions ? <View className="flex-row flex-wrap gap-2">{actions}</View> : null}
      {children}
    </Card>
  );
}

export function MetaButton({
  icon,
  label,
  onPress,
  disabled,
  loading,
  variant = 'outline',
  accessibilityLabel,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'destructive' | 'ghost';
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const off = disabled || loading;
  const box =
    variant === 'primary'
      ? 'border-primary bg-primary'
      : variant === 'destructive'
        ? 'border-destructive-border bg-destructive-soft'
        : variant === 'ghost'
          ? 'border-transparent'
          : 'border-border bg-card';
  const fg = variant === 'primary' ? colors.primaryForeground : variant === 'destructive' ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      onPress={onPress}
      className={`min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-control border px-3.5 active:opacity-70 ${box} ${off ? 'opacity-50' : ''}`}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text className="font-inter-semibold text-[13px]" style={{ color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ icon = 'shield-checkmark-outline', title, text, tone = 'info' }: { icon?: IconName; title?: string; text: string; tone?: Tone }) {
  const { colors } = useTheme();
  const color = toneColor(colors, tone);
  const box = tone === 'warning' ? 'bg-warning-soft border-warning-border' : tone === 'destructive' ? 'bg-destructive-soft border-destructive-border' : 'bg-info-soft border-info-border';
  return (
    <View className={`flex-row gap-2.5 rounded-control border p-3 ${box}`}>
      <Ionicons name={icon} size={17} color={color} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-0.5">
        {title ? <Text className="font-inter-semibold text-[13px]" style={{ color }}>{title}</Text> : null}
        <Text className="font-inter text-xs leading-[17px]" style={{ color }}>{text}</Text>
      </View>
    </View>
  );
}

/** Web'deki uyarı kutusu içindeki onay checkbox'ı. */
export function ConfirmCheck({ checked, onChange, text }: { checked: boolean; onChange: (next: boolean) => void; text: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={text}
      onPress={() => onChange(!checked)}
      className="min-h-[44px] flex-row items-start gap-2.5 rounded-control border border-warning-border bg-warning-soft p-3 active:opacity-70"
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={colors.warning} />
      <Text className="flex-1 font-inter text-xs leading-[17px]" style={{ color: colors.warning }}>{text}</Text>
    </Pressable>
  );
}

export function MetaStatusChip({ status, label }: { status: string; label?: string }) {
  const text =
    label ??
    (LEAD_STATUS_LABELS as Record<string, string>)[status] ??
    (SYNC_STATUS_LABELS as Record<string, string>)[status] ??
    status;
  return <Chip tone={metaStatusTone(status)} label={text} />;
}

export function ConnectionChip({ status }: { status: MetaConnectionStatus }) {
  return <Chip tone={metaStatusTone(status)} label={CONNECTION_STATUS_LABELS[status]} />;
}

/** Aktif bağlantı seçimi; seçenek yoksa açıklayıcı not. */
export function ConnectionSelect({
  connections,
  value,
  onChange,
  label = 'Meta bağlantısı',
  emptyText = 'Aktif Meta bağlantısı yok. Bağlantılar sekmesinden işletme hesabı ekleyin.',
}: {
  connections: MetaConnection[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  emptyText?: string;
}) {
  if (connections.length === 0) return <Notice icon="link-outline" tone="warning" text={emptyText} />;
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text>
      <ChoiceChips label={label} options={connections.map((item) => ({ value: item.id, label: item.name }))} value={value} onChange={onChange} />
    </View>
  );
}

export function HealthLine({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2 py-1">
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text className="font-inter text-xs text-muted-foreground">{label}</Text>
      <Text className="ml-auto max-w-[60%] font-inter-medium text-xs text-foreground" numberOfLines={1}>{value}</Text>
    </View>
  );
}

/** Ortak yükleniyor / hata / boş durumu. */
export function QueryState({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  emptyIcon,
  onRetry,
  errorMessage,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: IconName;
  onRetry: () => void;
  errorMessage: string;
  children: ReactNode;
}) {
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} hint={emptyHint} icon={emptyIcon} />;
  return <>{children}</>;
}

export function LoadMore({ visible, loading, onPress, caption }: { visible: boolean; loading: boolean; onPress: () => void; caption?: string }) {
  return (
    <View className="items-center gap-2 pt-1">
      {caption ? <Text className="font-inter text-xs text-muted-foreground">{caption}</Text> : null}
      {visible ? <MetaButton icon="chevron-down" label="Daha fazla yükle" onPress={onPress} loading={loading} /> : null}
    </View>
  );
}

export function Metric({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: IconName }) {
  const { colors } = useTheme();
  return (
    <View className="min-w-[46%] flex-1 gap-1 rounded-control border border-border bg-card-subtle p-3">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name={icon} size={14} color={colors.primary} />
        <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text className="font-display text-[22px] text-foreground" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {detail ? <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{detail}</Text> : null}
    </View>
  );
}
