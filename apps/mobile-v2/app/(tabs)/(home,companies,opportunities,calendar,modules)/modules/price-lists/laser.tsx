import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import type { LaserPriceListCode } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { useLaserPriceLists, useRecalculateLaserPriceList } from '@/src/api/products.hooks';
import type { LaserRecalculateResult } from '@/src/api/products.api';
import { downloadAndShare } from '@/src/native/files';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { Button, EmptyState, ErrorState, Field, ListSkeleton, SCREEN_PAD, ScreenHeader } from '@/src/ui';
import { Panel, Segmented, SmallButton } from '@/src/ui/finance/kit';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import {
  FORMULA_FIELDS,
  LASER_LIST_LABELS,
  buildRecalculateBody,
  canEditPrices,
  formatUsd,
  formulaToDraft,
  mergeLaserPreview,
  parsePrice,
  uniqueSorted,
  type FormulaDraft,
} from '@/src/ui/products/price-editors';

/**
 * Web `LaserPriceLists`: fiber lazer CIF / millileştirilmiş fiyat listeleri.
 * Herkes liste ve son fiyatı görür; maliyet, formül ve yeniden hesaplama
 * yalnız `canViewCost` + `price_lists.update` (veya süper admin) sahibine.
 */
export default function LaserPriceListsScreen() {
  const bottomInset = useNavigationBottomInset();
  const { user } = useAuth();
  const canEdit = canEditPrices(user);
  const query = useLaserPriceLists();
  const recalc = useRecalculateLaserPriceList();
  const [code, setCode] = useState<LaserPriceListCode>('LAZER-CIF-IST');
  const [draft, setDraft] = useState<FormulaDraft | null>(null);
  // Önizleme hangi liste + formülle hesaplandıysa onunla birlikte tutulur; kayıt o formülü gönderir.
  const [previewState, setPreviewState] = useState<{ result: LaserRecalculateResult; input: NonNullable<ReturnType<typeof buildRecalculateBody>> } | null>(null);
  const preview = previewState?.result ?? null;
  // Her istek ve her düzenleme sayacı artırır; geç gelen (eski liste/formül) yanıt atılır.
  const requestSeq = useRef(0);
  const setPreview = (next: null) => {
    requestSeq.current += 1;
    setPreviewState(next);
  };
  const [series, setSeries] = useState('');
  const [downloading, setDownloading] = useState(false);

  const data = query.data;
  const list = data?.lists.find((entry) => entry.code === code);
  useEffect(() => {
    setPreview(null);
    setDraft(list?.formula ? formulaToDraft(list.formula) : null);
  }, [code, data]); // web ile aynı: liste/veri değişince taslak ve önizleme sıfırlanır

  const seriesOptions = useMemo(() => uniqueSorted((list?.rows ?? []).map((row) => row.productName)), [list]);
  const rows = (list?.rows ?? []).filter((row) => !series || row.productName === series);
  const merged = mergeLaserPreview(rows, preview?.rows);
  const priced = (list?.rows ?? []).filter((row) => row.listPrice != null).length;
  const body = buildRecalculateBody(code, draft, false);

  const run = (apply: boolean) => {
    const input = apply && previewState ? { ...previewState.input, apply: true } : buildRecalculateBody(code, draft, apply);
    if (!input || !list) return toast.error('Tüm parametreler geçerli sayı olmalı');
    const seq = ++requestSeq.current;
    recalc.mutate(input, {
      onSuccess: (result) => {
        if (apply) {
          setPreview(null);
          toast.success(`${list.name}: ${result.rows.length} satır kaydedildi`);
        } else {
          if (seq !== requestSeq.current || result.code !== input.code) return;
          setPreviewState({ result, input });
          toast.info(
            `${result.rows.length} satır hesaplandı${result.skipped.length ? `, ${result.skipped.length} satır atlandı (konteyner/maliyet yok)` : ''}. Kaydetmeden listeye yazılmaz.`,
          );
        }
      },
      onError: (error) => toast.error(`Fiyat listesi hesaplanamadı: ${error.message}`),
    });
  };

  const confirmApply = () =>
    Alert.alert(
      'Listeye kaydet',
      `${list?.name ?? 'Fiyat listesi'} için önizlenen ${preview?.rows.length ?? 0} satırın liste ve son fiyatı güncellenecek. Devam edilsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Kaydet', style: 'destructive', onPress: () => run(true) },
      ],
    );

  const download = async () => {
    if (!list) return;
    setDownloading(true);
    try {
      await downloadAndShare(`/laser-price-lists/${code}/export`, `${list.name}.xlsx`);
    } catch (error) {
      toast.error(`Liste indirilemedi: ${error instanceof Error ? error.message : ''}`.trim());
    } finally {
      setDownloading(false);
    }
  };

  const title = 'Fiber lazer fiyat listeleri';
  if (query.isPending || query.error || !data || !list || !list.rows.length) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title={title} />
        {query.isPending ? (
          <ListSkeleton />
        ) : query.error ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="Lazer fiyat listesi yok" hint="Bu listede henüz fiyatlanacak lazer kesim makinesi bulunmuyor." />
        )}
      </SafeAreaView>
    );
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader title={title} subtitle="Fiber lazer kesim makineleri" />
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-2.5">
        <Segmented
          label="Fiyat listesi"
          value={code}
          options={data.lists.map((entry) => ({ value: entry.code, label: LASER_LIST_LABELS[entry.code] ?? entry.name }))}
          disabled={recalc.isPending}
          onChange={setCode}
        />
        <OptionPicker
          label="Baz kart"
          value={series || null}
          placeholder="Tümü"
          clearable
          searchable
          options={seriesOptions.map((value) => ({ value, label: value }))}
          onChange={(value) => setSeries(value ?? '')}
        />
        <SmallButton
          icon="download-outline"
          label={downloading ? 'İndiriliyor…' : 'Excel indir'}
          disabled={!priced || downloading}
          onPress={() => void download()}
        />
      </View>
      {canEdit && data.canViewCost && draft ? (
        <Panel
          title="Maliyet formülü"
          subtitle="Maliyet = (FOB + görünüm + navlun) × (1 + gümrük) + sabit giderler; çoklu konteynerde navlun toplanır. Liste ve son fiyat maliyetin üzerine kâr eklenerek tam dolara yuvarlanır. Önizlemeden sonra kaydedilir."
        >
          {FORMULA_FIELDS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              keyboardType="decimal-pad"
              value={draft[key]}
              editable={!recalc.isPending}
              error={parsePrice(draft[key]) == null ? 'Sayı girin' : undefined}
              onChangeText={(text) => {
                setPreview(null);
                setDraft({ ...draft, [key]: text });
              }}
            />
          ))}
          {!body ? <Text className="font-inter text-xs text-destructive">Tüm parametreler geçerli sayı olmalı (oranlar sunucu sınırları içinde).</Text> : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Önizle" variant="ghost" loading={recalc.isPending && !preview} disabled={recalc.isPending || !body} onPress={() => run(false)} />
            </View>
            <View className="flex-1">
              <Button label="Listeye kaydet" disabled={recalc.isPending || !body || !preview} onPress={confirmApply} />
            </View>
          </View>
        </Panel>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter text-xs text-muted-foreground">
        {rows.length} / {list.rows.length} satır · {priced} satır fiyatlı
        {list.updatedAt ? ` · son hesaplama ${new Date(list.updatedAt).toLocaleString('tr-TR')}` : ''}
      </Text>
      {preview && preview.skipped.length > 0 ? (
        <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter text-xs text-warning">
          Atlanan: {preview.skipped.map((row) => `${row.sourceModelCode} ${row.powerKw} kW`).join(', ')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={merged}
        keyExtractor={(entry) => entry.row.configurationPriceId}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        renderItem={({ item: entry }) => {
          const { row, changed } = entry;
          const name = `${row.sourceModelCode} ${row.productName} ${row.powerKw.toLocaleString('tr-TR')} kW`;
          return (
            <View style={{ paddingHorizontal: SCREEN_PAD }}>
              <View
                accessible
                accessibilityLabel={`${name}, liste fiyatı ${formatUsd(entry.listPrice)}, son fiyat ${formatUsd(entry.cashPrice)}${changed ? ', önizlemede değişti' : ''}`}
                className={`my-[5px] gap-2.5 rounded-[16px] border p-3.5 ${changed ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
              >
                <View className="gap-0.5">
                  <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                    {row.sourceModelCode} · {row.powerKw.toLocaleString('tr-TR')} kW
                  </Text>
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{row.productName}</Text>
                </View>
                {data.canViewCost ? (
                  <View className="flex-row flex-wrap gap-3">
                    <Cell label="Konteyner" value={row.container ?? '—'} muted />
                    <Cell label="FOB" value={formatUsd(row.fob)} muted />
                    <Cell label="Maliyet" value={formatUsd(entry.cost)} muted />
                  </View>
                ) : null}
                <View className="flex-row gap-3 border-t border-border pt-2.5">
                  <Cell label="Liste fiyatı" value={formatUsd(entry.listPrice)} previous={changed && row.listPrice != null ? formatUsd(row.listPrice) : undefined} />
                  <Cell label="Son fiyat" value={formatUsd(entry.cashPrice)} previous={changed && row.cashPrice != null ? formatUsd(row.cashPrice) : undefined} />
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState title="Satır bulunamadı" hint="Seçili baz kartta satır yok." actionLabel="Filtreyi temizle" onAction={() => setSeries('')} />}
      />
    </SafeAreaView>
  );
}

function Cell({ label, value, previous, muted }: { label: string; value: string; previous?: string; muted?: boolean }) {
  return (
    <View className="min-w-[28%] flex-1 gap-0.5">
      <Text className="font-inter text-[12px] text-muted-foreground">{label}</Text>
      <Text
        className={`font-inter-semibold text-[14px] ${muted ? 'text-muted-foreground' : 'text-foreground'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      {previous ? (
        <Text accessibilityLabel={`Önceki ${previous}`} className="font-inter text-[11px] text-muted-foreground line-through" style={{ fontVariant: ['tabular-nums'] }}>
          {previous}
        </Text>
      ) : null}
    </View>
  );
}
