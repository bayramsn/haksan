import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyOsmSearch } from '@/src/api/crm-general.hooks';
import type { CompanyOsmSearchResult } from '@/src/api/crm-general.api';
import { Chip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useTheme, type Tone } from '@/src/theme/theme';

const MATCH_QUALITY: Record<CompanyOsmSearchResult['matchQuality'], { label: string; tone: Tone }> = {
  exact: { label: 'Bina/firma eşleşmesi', tone: 'success' },
  street: { label: 'Sokak/cadde düzeyi', tone: 'info' },
  area: { label: 'İlçe/şehir yaklaşık', tone: 'warning' },
};

/** Web OsmCompanySearch karşılığı: sonuç seçimi koordinatı üst forma verir. */
export function OsmSearchPanel({
  query,
  address,
  city,
  district,
  country,
  buttonLabel = "OSM'de ara",
  onSelect,
}: {
  query: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  buttonLabel?: string;
  onSelect: (result: CompanyOsmSearchResult) => void;
}) {
  const { colors } = useTheme();
  const search = useCompanyOsmSearch();
  const [term, setTerm] = useState(query);
  const [results, setResults] = useState<CompanyOsmSearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setTerm((current) => (current.trim() ? current : query));
  }, [query]);

  function run() {
    const q = (term.trim() || query.trim()).slice(0, 160);
    if (q.length < 2) {
      toast.error('Arama için en az 2 karakter girin');
      return;
    }
    setSelectedId(null);
    setStatus(null);
    search.mutate(
      {
        q,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        district: district?.trim() || undefined,
        country: country?.trim() || undefined,
      },
      {
        onSuccess: (rows) => {
          setResults(rows);
          if (rows.length === 0) {
            setStatus("OSM'de eşleşme bulunamadı. Adresi kontrol edin veya haritadan pin seçin.");
            toast.error('OpenStreetMap sonucu bulunamadı');
            return;
          }
          const exact = rows.filter((row) => row.matchQuality === 'exact').length;
          setStatus(
            exact > 0
              ? `${rows.length} sonuç bulundu; ${exact} sonuç bina/firma düzeyinde eşleşti.`
              : `${rows.length} yaklaşık sonuç bulundu. Tam konum için haritadan firma girişini seçin.`,
          );
        },
        onError: (error) => {
          setResults([]);
          setStatus(error.message || 'OpenStreetMap araması şu anda tamamlanamadı.');
          toast.error('OpenStreetMap araması başarısız');
        },
      },
    );
  }

  return (
    <View className="gap-2 rounded-control border border-border bg-card p-3">
      <View className="flex-row items-center gap-2">
        <View className="min-h-11 flex-1 flex-row items-center gap-2 rounded-control border border-border bg-canvas px-3">
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            onSubmitEditing={run}
            returnKeyType="search"
            maxLength={160}
            placeholder="Firma adını OpenStreetMap'te ara"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="OpenStreetMap firma araması"
            className="flex-1 py-2 font-inter text-sm text-foreground"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          disabled={search.isPending}
          onPress={run}
          className="min-h-11 flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3"
        >
          {search.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="location-outline" size={16} color={colors.primary} />
          )}
          <Text className="font-inter-medium text-sm text-foreground">{buttonLabel}</Text>
        </Pressable>
      </View>
      {status ? (
        <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-muted-foreground">
          {status}
        </Text>
      ) : null}
      {results.map((result) => (
        <Pressable
          key={result.id}
          accessibilityRole="button"
          accessibilityLabel={`${result.displayName} konumunu seç`}
          onPress={() => {
            setSelectedId(result.id);
            onSelect(result);
          }}
          className={`min-h-11 flex-row gap-3 rounded-control border px-3 py-2.5 ${selectedId === result.id ? 'border-primary bg-secondary' : 'border-border bg-canvas'}`}
        >
          <Ionicons name="location" size={18} color={colors.primary} />
          <View className="min-w-0 flex-1 gap-1">
            <Text numberOfLines={2} className="font-inter-medium text-sm text-foreground">
              {result.displayName}
            </Text>
            <Chip tone={MATCH_QUALITY[result.matchQuality].tone} label={`${MATCH_QUALITY[result.matchQuality].label} · %${result.matchScore}`} />
            <Text className="font-inter text-xs text-muted-foreground">{result.matchReason}</Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
              {selectedId === result.id ? ' · seçildi' : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      <Text className="font-inter text-[11px] text-muted-foreground">© OpenStreetMap contributors</Text>
    </View>
  );
}
