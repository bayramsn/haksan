import { Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useProduct } from '@/src/api/inventory.hooks';
import { formatAmount } from '@/src/lib/format';
import { Card, Chip, DetailHeader, ErrorState, Eyebrow, DetailSkeleton } from '@/src/ui';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-4 border-b border-border py-2.5">
      <Text className="font-inter text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter text-sm text-foreground" numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useProduct(id);

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Ürün Detayı" />
        {isPending ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const currency = data.currency?.code ?? 'TRY';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Ürün Detayı" subtitle={data.modelCode} />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-3">
          {data.imageUrl ? (
            <Image
              source={{ uri: data.imageUrl }}
              className="h-40 w-full rounded-control bg-muted"
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View className="gap-1.5">
            <View className="flex-row flex-wrap gap-1.5">
              {data.brand ? <Chip tone="info" label={data.brand.name} /> : null}
              {data.category ? <Chip tone="neutral" label={data.category.name} /> : null}
              {data.isActive === false ? <Chip tone="destructive" label="Pasif" /> : null}
            </View>
            <Text className="text-[19px] font-inter-semibold leading-[1.2] text-foreground">{data.fullName}</Text>
            <Text className="font-inter text-[13px] text-muted-foreground">{data.modelCode}</Text>
          </View>
        </Card>

        <Card>
          <Row label="Liste fiyatı" value={data.listPrice ? formatAmount(data.listPrice, currency) : null} />
          <Row label="Peşin fiyat" value={data.cashPrice ? formatAmount(data.cashPrice, currency) : null} />
          <Row label="KDV" value={data.vatRate ? `%${Number(data.vatRate)}` : null} />
          <Row label="Stok kodu" value={data.stockCode} />
          <Row label="Seri" value={data.series} />
          <Row label="Tip" value={data.productType?.name} />
          <Row label="Alt kategori" value={data.subcategory?.name} />
          <Row label="Menşe" value={data.originCountry} />
          <Row label="GTIP" value={data.hsCode} />
          <Row label="Model adı" value={data.modelName} />
          <Row label="Üretim yılı" value={data.productionYear ? String(data.productionYear) : null} />
        </Card>

        {data.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            <Text className="font-inter text-sm leading-[1.4] text-foreground">{data.description}</Text>
          </Card>
        ) : null}

        {data.specs?.length ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Teknik özellikler ({data.specs.length})</Eyebrow>
            </View>
            <Card className="gap-0">
              {data.specs.map((spec, index) => (
                <View
                  key={`${spec.key}-${index}`}
                  className={`flex-row justify-between gap-4 py-2 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <Text className="flex-1 font-inter text-sm text-muted-foreground">{spec.key}</Text>
                  <Text className="flex-1 text-right font-inter text-sm text-foreground">
                    {spec.value}
                    {spec.unit ? ` ${spec.unit}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
