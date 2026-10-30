import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyWebsiteLookup } from '@/src/api/crm-general.hooks';
import type { CompanyWebsiteLookupResult } from '@/src/api/crm-general.api';
import { Button, Chip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useTheme, type Tone } from '@/src/theme/theme';

const CONFIDENCE: Record<CompanyWebsiteLookupResult['confidence'], { label: string; tone: Tone }> = {
  high: { label: 'Güçlü eşleşme', tone: 'success' },
  medium: { label: 'Kontrol edilmeli', tone: 'warning' },
  low: { label: 'Zayıf eşleşme', tone: 'destructive' },
};

const openUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
};

/** Web CompanyWebsiteLookup karşılığı; öneriler kaydetmeden önce gösterilir. */
export function WebsiteLookupPanel({
  query,
  website,
  address,
  city,
  district,
  country,
  onApply,
}: {
  query: string;
  website?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  onApply: (suggestion: CompanyWebsiteLookupResult['suggestion']) => void;
}) {
  const { colors } = useTheme();
  const lookup = useCompanyWebsiteLookup();
  const [result, setResult] = useState<CompanyWebsiteLookupResult | null>(null);
  const disabled = lookup.isPending || query.trim().length < 2;

  function run() {
    if (query.trim().length < 2) {
      toast.error('Önce firma ünvanını yazın');
      return;
    }
    setResult(null);
    lookup.mutate(
      {
        q: query.trim(),
        website: website?.trim() || undefined,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        district: district?.trim() || undefined,
        country: country?.trim() || undefined,
      },
      {
        onSuccess: (response) => {
          setResult(response);
          toast.success(`Resmî site incelendi · ${response.confidenceScore}/100 eşleşme puanı`);
        },
        onError: () => toast.error('Resmî site bilgisi bulunamadı · Web sitesini yazıp tekrar deneyin.'),
      },
    );
  }

  const rows = result
    ? ([
        { icon: 'location-outline', label: 'Adres', value: result.suggestion.address },
        { icon: 'call-outline', label: 'Telefon', value: result.suggestion.phone },
        { icon: 'mail-outline', label: 'E-posta', value: result.suggestion.email },
      ] as const).filter((row) => row.value)
    : [];

  return (
    <View className="gap-3 rounded-control border border-border bg-card p-3">
      <View className="flex-row items-start gap-2.5">
        <Ionicons name="globe-outline" size={18} color={colors.info} />
        <View className="flex-1">
          <Text className="font-inter-semibold text-sm text-foreground">Resmî site doğrulaması</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            Firma adıyla siteyi bulur; iletişim sayfasındaki önerileri kaydetmeden önce size gösterir.
          </Text>
          {!website?.trim() ? (
            <Text className="mt-1 font-inter text-[11px] text-muted-foreground">
              Web sitesi boşsa önce doğrulanmış firma/harita kaydındaki resmî site aranır.
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Siteden bilgileri bul"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={run}
        className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-border bg-canvas px-3 ${disabled ? 'opacity-50' : ''}`}
      >
        {lookup.isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="search-circle-outline" size={18} color={colors.primary} />
        )}
        <Text className="font-inter-medium text-sm text-foreground">
          {lookup.isPending ? 'Site inceleniyor' : 'Siteden bilgileri bul'}
        </Text>
      </Pressable>

      {result ? (
        <View className="gap-2 border-l-2 border-primary pl-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-inter-medium text-sm text-foreground">{result.siteName || query}</Text>
            <Chip tone={CONFIDENCE[result.confidence].tone} label={`${CONFIDENCE[result.confidence].label} · ${result.confidenceScore}/100`} />
          </View>
          <Pressable accessibilityRole="link" accessibilityLabel="Resmî siteyi aç" onPress={() => openUrl(result.officialWebsite)} className="min-h-11 justify-center">
            <Text numberOfLines={1} className="font-inter-medium text-xs text-primary underline">
              {result.officialWebsite}
            </Text>
          </Pressable>
          <Text className="font-inter text-xs text-muted-foreground">{result.matchReason}</Text>
          {rows.map((row) => (
            <View key={row.label} className="flex-row items-start gap-2 rounded-control border border-border bg-canvas px-2.5 py-2">
              <Ionicons name={row.icon} size={14} color={colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-[10px] uppercase text-muted-foreground">{row.label}</Text>
                <Text numberOfLines={2} className="font-inter text-xs text-foreground">{row.value}</Text>
              </View>
            </View>
          ))}
          {result.suggestion.latitude != null && result.suggestion.longitude != null ? (
            <Text className="font-inter text-xs text-success">
              Eşleşen konum: {result.suggestion.latitude.toFixed(5)}, {result.suggestion.longitude.toFixed(5)}
            </Text>
          ) : null}
          {result.warnings.map((warning) => (
            <View key={warning} className="flex-row items-start gap-1.5">
              <Ionicons name="warning-outline" size={14} color={colors.warning} />
              <Text className="flex-1 font-inter text-[11px] text-foreground">{warning}</Text>
            </View>
          ))}
          <Text className="font-inter text-[11px] text-muted-foreground">
            Dolu alanlar korunur; önerileri kaydetmeden önce düzenleyebilirsiniz.
          </Text>
          <Button label="Önerileri forma uygula" onPress={() => onApply(result.suggestion)} />
        </View>
      ) : null}
    </View>
  );
}
