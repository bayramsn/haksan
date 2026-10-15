import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useCompatibleOptionalEquipment,
  useInventoryList,
  useProduct,
  useProductMedia,
  useProductOptions,
} from '@/src/api/inventory.hooks';
import { mediaUrl } from '@/src/api/config';
import { formatAmount } from '@/src/lib/format';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, DetailSkeleton, ListRow } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { useTheme, type Tone } from '@/src/theme/theme';
import { useCan } from '@/src/auth/AuthProvider';

type ProductTab = 'general' | 'stocks' | 'specs' | 'suppliers';

function ProductRow({
  icon,
  label,
  value,
  tone,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null | undefined;
  tone?: Tone;
  last?: boolean;
}) {
  const { colors } = useTheme();
  if (!value) return null;

  const valueColor =
    tone === 'destructive'
      ? colors.destructive
      : tone === 'success'
        ? colors.success
        : colors.foreground;

  return (
    <View className={`min-h-[54px] flex-row items-center gap-3 py-3 ${last ? '' : 'border-b border-border'}`}>
      <Ionicons name={icon} size={20} color={colors.mutedForeground} />
      <Text className="min-w-[100px] font-inter text-[15px] text-muted-foreground" style={{ letterSpacing: 0 }}>
        {label}
      </Text>
      <Text
        className="flex-1 text-right font-inter-medium text-[15px]"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={{ color: valueColor, letterSpacing: 0, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

function EquipmentCard({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}) {
  const { colors } = useTheme();
  const color = tone === 'success' ? colors.success : colors.info;
  return (
    <Card className="gap-2">
      <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
        {title}
      </Text>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} className="flex-row items-start gap-2">
          <Ionicons name={icon} size={17} color={color} style={{ marginTop: 2 }} />
          <Text className="flex-1 font-inter text-[14px] leading-5 text-foreground" style={{ letterSpacing: 0 }}>
            {item}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isPending, error, refetch } = useProduct(id);
  const { colors } = useTheme();
  const canUpdate = useCan('products.update');
  const [tab, setTab] = useState<ProductTab>('general');
  const media = useProductMedia(id);
  const optionSets = useProductOptions(id);
  const compatibleOptional = useCompatibleOptionalEquipment(id);
  // Bu modele ait seri numaralı stoklar; envanter ucu model koduyla aranabiliyor.
  const stocks = useInventoryList({ search: data?.modelCode }, Boolean(data?.modelCode));

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
  // imageUrl göreli gelir (`/products/media/:fileId`); Image mutlak URL ister.
  const imageUri = mediaUrl(data.imageUrl);
  const standardEquipment = data.standardEquipment ?? [];
  const optionalEquipment = data.optionalEquipment ?? [];
  // Arama modelin ötesine taşabildiği için istemcide bu modele daraltılıyor.
  const productStocks = (stocks.data?.items ?? []).filter((item) => item.product?.id === data.id);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Ürün Detayı" />

      <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        <View className="px-[18px] pt-4">
          <Card className="min-h-[188px] flex-row items-center gap-4 p-4">
            <View className="h-[150px] w-[45%] items-center justify-center overflow-hidden rounded-control bg-card-subtle">
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  className="h-full w-full"
                  resizeMode="contain"
                  accessibilityLabel={data.fullName}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Ionicons name="cube-outline" size={64} color={colors.lineStrong} />
              )}
            </View>
            <View className="min-w-0 flex-1 gap-3">
              <Text
                className="font-inter-bold text-[22px] leading-[1.16] text-foreground"
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={{ letterSpacing: 0 }}
              >
                {data.fullName}
              </Text>
              <Chip tone={data.isActive ? 'success' : 'destructive'} label={data.isActive ? 'Aktif' : 'Pasif'} />
              <View className="gap-1">
                <Text className="font-inter text-[13px] text-muted-foreground" style={{ letterSpacing: 0 }}>
                  Ürün Kodu
                </Text>
                <Text
                  className="font-inter-semibold text-[18px] text-primary"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ letterSpacing: 0, fontVariant: ['tabular-nums'] }}
                >
                  {data.modelCode}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View className="pt-5">
          <Tabs
            tabs={[
              { value: 'general', label: 'Genel', icon: 'document-text-outline' },
              { value: 'stocks', label: 'Stoklar', icon: 'cube-outline' },
              { value: 'specs', label: 'Özellikler', icon: 'settings-outline', badge: data.specs?.length },
              { value: 'suppliers', label: 'Tedarikçiler', icon: 'people-outline' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        <View className="gap-4 px-[18px] pt-4">
          {tab === 'general' ? (
            <>
              <Card className="gap-0 px-4 py-1">
                <ProductRow icon="barcode-outline" label="Barkod" value={data.stockCode ?? data.modelCode} />
                <ProductRow icon="grid-outline" label="Kategori" value={data.category?.name} />
                <ProductRow icon="pricetag-outline" label="Marka" value={data.brand?.name} />
                <ProductRow icon="layers-outline" label="Ürün grubu" value={data.productGroup?.name} />
                <ProductRow icon="arrow-down-circle-outline" label="Liste fiyatı" value={data.listPrice ? formatAmount(data.listPrice, currency) : null} />
                <ProductRow icon="arrow-up-circle-outline" label="Peşin fiyat" value={data.cashPrice ? formatAmount(data.cashPrice, currency) : null} tone="destructive" />
                <ProductRow icon="calculator-outline" label="KDV oranı" value={data.vatRate != null ? `%${Number(data.vatRate)}` : null} />
                <ProductRow icon="shield-checkmark-outline" label="Durum" value={data.isActive ? 'Aktif' : 'Pasif'} tone={data.isActive ? 'success' : 'destructive'} last />
              </Card>

              {data.description ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
                    Açıklama
                  </Text>
                  <Text className="font-inter text-[14px] leading-5 text-foreground" style={{ letterSpacing: 0 }}>
                    {data.description}
                  </Text>
                </Card>
              ) : null}

              {(data.muadilProducts ?? []).length ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
                    Muadil Ürünler
                  </Text>
                  {(data.muadilProducts ?? []).map((alt) => (
                    <Pressable
                      key={alt.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/(tabs)/modules/products/${alt.id}`)}
                      className="flex-row items-center justify-between gap-3 py-1 active:opacity-60"
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-inter text-[13px] text-foreground" numberOfLines={2}>{alt.fullName}</Text>
                        <Text className="font-inter text-[11px] text-muted-foreground">
                          {[alt.modelCode, alt.brand?.name].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {alt.listPrice ? (
                        <Text className="font-inter-medium text-[13px] text-foreground">
                          {formatAmount(alt.listPrice, alt.currency?.code ?? currency)}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </Card>
              ) : null}

              {(media.data ?? []).length ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
                    Broşür & Dokümanlar
                  </Text>
                  {(media.data ?? []).map((file) => (
                    <Pressable
                      key={file.fileId}
                      accessibilityRole="button"
                      accessibilityLabel={file.title ?? 'Doküman'}
                      onPress={() => {
                        const url = mediaUrl(file.url);
                        if (url) void Linking.openURL(url);
                      }}
                      className="flex-row items-center gap-3 py-1 active:opacity-60"
                    >
                      <Ionicons
                        name={file.mediaType === 'image' ? 'image-outline' : 'document-text-outline'}
                        size={18}
                        color={colors.primary}
                      />
                      <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={2}>
                        {file.title ?? file.mimeType}
                      </Text>
                      <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ))}
                </Card>
              ) : null}

              <Card className="gap-0 px-4 py-1">
                <ProductRow icon="albums-outline" label="Seri" value={data.series} />
                <ProductRow icon="cube-outline" label="Tip" value={data.productType?.name} />
                <ProductRow icon="git-branch-outline" label="Alt kategori" value={data.subcategory?.name} />
                <ProductRow icon="earth-outline" label="Menşe" value={data.originCountry} />
                <ProductRow icon="document-outline" label="GTIP" value={data.hsCode} />
                <ProductRow icon="construct-outline" label="Model adı" value={data.modelName} />
                <ProductRow icon="calendar-outline" label="Üretim yılı" value={data.productionYear ? String(data.productionYear) : null} last />
              </Card>
            </>
          ) : null}

          {tab === 'specs' ? (
            <>
              {data.specs?.length ? (
                <Card className="gap-0 px-4 py-1">
                  {data.specs.map((spec, index) => (
                    <ProductRow
                      key={`${spec.key}-${index}`}
                      icon="options-outline"
                      label={spec.key}
                      value={`${spec.value}${spec.unit ? ` ${spec.unit}` : ''}`}
                      last={index === data.specs!.length - 1}
                    />
                  ))}
                </Card>
              ) : null}

              {standardEquipment.length ? (
                <EquipmentCard title="Standart Donanım" items={standardEquipment} icon="checkmark-circle-outline" tone="success" />
              ) : null}
              {optionalEquipment.length ? (
                <EquipmentCard title="Opsiyonel Donanım" items={optionalEquipment} icon="add-circle-outline" tone="info" />
              ) : null}

              {(optionSets.data ?? []).length ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
                    Opsiyon Setleri
                  </Text>
                  {(optionSets.data ?? []).map((set) => (
                    <View key={set.id} className="gap-1">
                      <Text className="font-inter-medium text-[13px] text-foreground">{set.name}</Text>
                      {set.values.map((value) => (
                        <View key={value.id} className="flex-row items-center justify-between gap-3 pl-3">
                          <Text className="flex-1 font-inter text-[13px] text-muted-foreground" numberOfLines={2}>
                            {value.name}
                          </Text>
                          {value.priceDelta && Number(value.priceDelta) !== 0 ? (
                            <Text className="font-inter-medium text-[13px] text-foreground">
                              {formatAmount(value.priceDelta, currency)}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ))}
                </Card>
              ) : null}

              {(compatibleOptional.data ?? []).length ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
                    Uyumlu Opsiyonel Donanım
                  </Text>
                  {(compatibleOptional.data ?? []).map((row) => (
                    <Pressable
                      key={row.product.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/(tabs)/modules/products/${row.product.id}`)}
                      className="flex-row items-center justify-between gap-3 py-1 active:opacity-60"
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-inter text-[13px] text-foreground" numberOfLines={2}>
                          {row.product.fullName}
                        </Text>
                        <Text className="font-inter text-[11px] text-muted-foreground">{row.product.modelCode}</Text>
                      </View>
                      {row.product.listPrice ? (
                        <Text className="font-inter-medium text-[13px] text-foreground">
                          {formatAmount(row.product.listPrice, row.currency?.code ?? currency)}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </Card>
              ) : null}

              {!data.specs?.length &&
              !standardEquipment.length &&
              !optionalEquipment.length &&
              !(optionSets.data ?? []).length &&
              !(compatibleOptional.data ?? []).length ? (
                <Card className="items-center gap-3 py-10">
                  <Ionicons name="options-outline" size={30} color={colors.mutedForeground} />
                  <Text className="font-inter-medium text-[14px] text-muted-foreground" style={{ letterSpacing: 0 }}>
                    Teknik özellik kaydı yok
                  </Text>
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === 'stocks' ? (
            stocks.isPending ? (
              <Card className="items-center py-8">
                <Text className="font-inter text-[13px] text-muted-foreground">Stoklar yükleniyor…</Text>
              </Card>
            ) : productStocks.length === 0 ? (
              <Card className="items-center gap-4 py-8">
                <Ionicons name="cube-outline" size={34} color={colors.mutedForeground} />
                <Text className="text-center font-inter-medium text-[14px] text-muted-foreground" style={{ letterSpacing: 0 }}>
                  Bu modele ait seri numaralı stok kaydı yok.
                </Text>
                <Button
                  label="Tüm Stoklar"
                  variant="ghost"
                  trailingIcon="arrow-forward"
                  onPress={() => router.push('/(tabs)/modules/inventory')}
                />
              </Card>
            ) : (
              <>
                {productStocks.map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.serialNumber}
                    lines={[item.product?.fullName, item.warehouse?.name]}
                    icon="cube-outline"
                    iconTone="info"
                    chip={item.status?.name ? { label: item.status.name, tone: 'neutral' } : undefined}
                    onPress={() => router.push(`/(tabs)/modules/inventory/${item.id}`)}
                  />
                ))}
              </>
            )
          ) : null}

          {tab === 'suppliers' ? (
            data.supplierCompany ? (
              <ListRow
                title={data.supplierCompany.legalTitle}
                lines={[data.supplierCompany.shortName]}
                icon="business-outline"
                iconTone="info"
                onPress={() => router.push(`/(tabs)/modules/companies/${data.supplierCompany!.id}`)}
              />
            ) : (
              <EmptyState title="Tedarikçi kaydı yok" hint="Bu ürüne bağlı tedarikçi firma tanımlı değil." />
            )
          ) : null}
        </View>
      </ScrollView>

      <View className="flex-row gap-3 border-t border-border bg-card px-[18px] py-3">
        {canUpdate ? (
          <View className="flex-1">
            <Button
              label="Düzenle"
              variant="ghost"
              onPress={() => router.push({ pathname: '/modal/edit-product', params: { id } } as unknown as Href)}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Button label="Stok Hareketleri" onPress={() => router.push('/(tabs)/modules/inventory')} />
        </View>
      </View>
    </SafeAreaView>
  );
}
