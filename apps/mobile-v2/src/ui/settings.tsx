import { Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Eyebrow } from '@/src/ui';

/** Ayar/menü grubu: başlık + kart içinde ayraçlı satırlar. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      {title ? (
        <View className="px-1">
          <Eyebrow>{title}</Eyebrow>
        </View>
      ) : null}
      <View className="overflow-hidden rounded-surface border border-border bg-card">{children}</View>
    </View>
  );
}

type BaseRow = {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  subtitle?: string;
  /** Grup içindeki ilk satırda üst çizgi olmasın. */
  first?: boolean;
};

type RowProps =
  | (BaseRow & { kind?: 'link'; value?: string; onPress: () => void; danger?: boolean })
  | (BaseRow & { kind: 'switch'; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean })
  /** Salt okunur bilgi satırı: basılamaz, chevron yok. */
  | (BaseRow & { kind: 'info'; value?: string });

export function SettingsRow(props: RowProps) {
  const { colors } = useTheme();
  const tone: Tone = props.tone ?? 'neutral';
  const danger = (props.kind === undefined || props.kind === 'link') && props.danger === true;

  const content = (
    <View className={`flex-row items-center gap-3 px-3.5 py-3 ${props.first ? '' : 'border-t border-border'}`}>
      <View className={`h-9 w-9 items-center justify-center rounded-control border ${chipClass[danger ? 'destructive' : tone]}`}>
        <Ionicons name={props.icon} size={17} color={toneColor(colors, danger ? 'destructive' : tone)} />
      </View>

      <View className="flex-1 gap-0.5">
        <Text className={`text-[15px] font-inter-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>

      {props.kind === 'switch' ? (
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          trackColor={{ true: colors.primary, false: colors.lineStrong }}
          accessibilityLabel={props.title}
        />
      ) : props.kind === 'info' ? (
        props.value ? (
          <Text selectable className="max-w-[55%] font-inter text-[13px] text-muted-foreground" numberOfLines={2}>
            {props.value}
          </Text>
        ) : null
      ) : (
        <View className="flex-row items-center gap-1.5">
          {props.value ? <Text className="font-inter text-[13px] text-muted-foreground">{props.value}</Text> : null}
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
      )}
    </View>
  );

  if (props.kind === 'switch') return content;
  if (props.kind === 'info') {
    return (
      <View accessible accessibilityLabel={props.value ? `${props.title}: ${props.value}` : props.title}>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.title} onPress={props.onPress} className="active:opacity-70">
      {content}
    </Pressable>
  );
}
