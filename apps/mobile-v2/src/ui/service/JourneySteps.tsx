import { Fragment } from 'react';
import { Text, View } from 'react-native';

/** Web "Kurulum Yolculuğu" / teslimat milestone göstergesi; `current` ulaşılan son adımın indeksi. */
export function JourneySteps({ steps, current, compact }: { steps: readonly string[]; current: number; compact?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${steps[Math.min(current, steps.length - 1)] ?? ''} adımı, ${current + 1}/${steps.length}`} className="gap-1">
      <View className="flex-row items-center">
        {steps.map((label, index) => {
          const reached = index <= current;
          return (
            <Fragment key={label}>
              <View
                className={`items-center justify-center rounded-full border ${compact ? 'h-5 w-5' : 'h-7 w-7'} ${reached ? 'border-primary bg-primary' : 'border-border bg-card'}`}
              >
                <Text className={`font-inter-bold ${compact ? 'text-[10px]' : 'text-[12px]'} ${reached ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                  {index + 1}
                </Text>
              </View>
              {index < steps.length - 1 ? <View className={`h-px flex-1 ${index < current ? 'bg-primary' : 'bg-border'}`} /> : null}
            </Fragment>
          );
        })}
      </View>
      <View className="flex-row justify-between">
        {steps.map((label) => (
          <Text key={label} className="font-inter text-[10px] uppercase text-muted-foreground">{label}</Text>
        ))}
      </View>
    </View>
  );
}
