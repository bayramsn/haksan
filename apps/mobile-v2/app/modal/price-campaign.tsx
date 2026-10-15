import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { useAllProducts, usePriceListItemsFull, useSaveCampaign, useScopedPriceLists } from '@/src/api/products.hooks';
import { Card, ErrorState, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { DateInputField, FormScreen, SwitchRow } from '@/src/ui/finance/kit';
import { priceOverrideMap, salesPricePermissions, validateCampaign } from '@/src/ui/products/sales-price';

/** Web `CampaignPriceCell`: kampanya fiyatı, tarih aralığı ve aktiflik (yalnız Süper Admin). */
export default function PriceCampaignScreen() {
  const router = useRouter();
  const { listId = '', productId = '' } = useLocalSearchParams<{ listId?: string; productId?: string }>();
  const { user } = useAuth();
  const { canManageCampaign } = salesPricePermissions(user);
  const lists = useScopedPriceLists();
  const products = useAllProducts();
  const items = usePriceListItemsFull(listId);
  const save = useSaveCampaign(listId);

  const override = useMemo(() => priceOverrideMap(items.data ?? [])[productId], [items.data, productId]);
  const product = products.data?.find((row) => row.id === productId);
  const list = lists.data?.find((row) => row.id === listId);
  const currency = list?.currency?.code ?? product?.currency?.code ?? '';

  const [price, setPrice] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || items.isPending) return;
    setPrice(override?.campaignPrice != null ? String(override.campaignPrice) : '');
    setFrom(override?.campaignValidFrom ?? '');
    setUntil(override?.campaignValidUntil ?? '');
    setActive(Boolean(override?.campaignIsActive));
    setReady(true);
  }, [items.isPending, override, ready]);

  if (!canManageCampaign) return <Redirect href={'/(tabs)/modules/price-lists' as Href} />;

  function submit() {
    const result = validateCampaign({ price, from, until, active });
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    save.mutate(
      { itemId: override?.itemId, body: { productModelId: productId, ...result.value } },
      {
        onSuccess: () => {
          toast.success('Kampanya fiyatı güncellendi');
          router.back();
        },
        onError: (err) => toast.error(err.message ? `Kampanya fiyatı kaydedilemedi: ${err.message}` : 'Kampanya fiyatı kaydedilemedi'),
      },
    );
  }

  return (
    <FormScreen title="Kampanya Fiyatı" onSubmit={submit} submitting={save.isPending} submitDisabled={!ready}>
      {items.isPending || products.isPending ? (
        <Loading />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => void items.refetch()} />
      ) : (
        <>
          <Card className="gap-1">
            <Text className="font-inter-semibold text-[15px] text-foreground">{product?.fullName ?? 'Ürün'}</Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {[list?.name || list?.code, currency].filter(Boolean).join(' · ')}
            </Text>
          </Card>
          <Field
            label={`Kampanya fiyatı${currency ? ` (${currency})` : ''}`}
            placeholder="Kamp."
            value={price}
            onChangeText={(value) => {
              setPrice(value);
              setError(undefined);
            }}
            keyboardType="decimal-pad"
            error={error}
          />
          <DateInputField label="Başlangıç" value={from} onChange={setFrom} />
          <DateInputField label="Bitiş" value={until} onChange={setUntil} />
          <SwitchRow label="Kampanya aktif" value={active} onChange={setActive} />
        </>
      )}
    </FormScreen>
  );
}
