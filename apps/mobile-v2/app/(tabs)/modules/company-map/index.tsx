import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCompanyDirectory, useNearbyStaleVisits, useSetCompanyLocation } from '@/src/api/crm-general.hooks';
import type { CompanyListRow, CompanyOsmSearchResult, NearbyStaleVisitCompany } from '@/src/api/crm-general.api';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, FilterChips, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { SheetMenu, type SheetMenuItem } from '@/src/ui/crm/SheetMenu';
import { OsmSearchPanel } from '@/src/ui/crm/OsmSearchPanel';
import { CompanyMapSurface } from '@/src/features/company-map/CompanyMapSurface';
import {
  LOCATION_QUALITY_LABELS,
  PROVINCE_NAMES,
  appleRouteUrl,
  centroidForProvince,
  directionsUrl,
  filterFirms,
  firmsWithoutExactPin,
  googleRouteUrl,
  mapFirms,
  osmSourceFor,
  planRoute,
  type FirmType,
  type LatLng,
  type MapRadius,
  type MappedFirm,
} from '@/src/features/company-map/geo';
import { FIRM_TYPE_LABEL, FIRM_TYPE_TONE, LOCATION_QUALITY_TONE, type MapPin } from '@/src/features/company-map/map-style';

type GeoSource = 'gps' | 'province' | 'manual_pin';
type PickMode = null | { type: 'user' } | { type: 'firm'; id: string };
type Firm = MappedFirm<CompanyListRow>;

const FIRM_TYPES: FirmType[] = ['customer', 'supplier_customer', 'supplier', 'competitor'];
const RADIUS_OPTIONS: { value: MapRadius; label: string }[] = [
  { value: 'all', label: 'Tüm mesafe' },
  { value: '50', label: '50 km' },
  { value: '100', label: '100 km' },
  { value: '250', label: '250 km' },
  { value: '500', label: '500 km' },
];
const SOURCE_LABEL: Record<GeoSource, string> = { gps: 'GPS', province: 'İl merkezi', manual_pin: 'Haritadan seçilen nokta' };

function configuredGoogleMapsKey(): boolean {
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  return Boolean(extra?.googleMapsApiKey?.trim());
}

const place = (firm: { district: string | null; city: string | null }) => [firm.district, firm.city].filter(Boolean).join(', ') || 'Konum bilgisi yok';

export default function CompanyMapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const directory = useCompanyDirectory();
  const setLocation = useSetCompanyLocation();
  const nearby = useNearbyStaleVisits();
  const mapAvailable = Platform.OS === 'web' || Platform.OS === 'ios' || (Platform.OS === 'android' && configuredGoogleMapsKey());
  const [view, setView] = useState<'map' | 'list'>(mapAvailable ? 'map' : 'list');
  const [search, setSearch] = useState('');
  const [firmType, setFirmType] = useState<FirmType | null>(null);
  const [radius, setRadius] = useState<MapRadius>('all');
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [geoSource, setGeoSource] = useState<GeoSource | null>(null);
  const [province, setProvince] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [pick, setPick] = useState<PickMode>(null);
  const [route, setRoute] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menuFirmId, setMenuFirmId] = useState<string | null>(null);
  const [osmFirmId, setOsmFirmId] = useState<string | null>(null);
  const [stale, setStale] = useState<NearbyStaleVisitCompany[]>([]);
  const menuRef = useRef<BottomSheetModal>(null);

  const rows = useMemo(() => directory.data?.rows ?? [], [directory.data?.rows]);
  const firms = useMemo(() => mapFirms(rows, userPos), [rows, userPos]);
  const filtered = useMemo(
    () => filterFirms(firms, { firmType: firmType ?? 'all', radius, search }),
    [firms, firmType, radius, search],
  );
  const withoutPin = useMemo(() => firmsWithoutExactPin(rows, { firmType: firmType ?? 'all', search }), [rows, firmType, search]);
  const routePlan = useMemo(
    () => planRoute(route.map((id) => firms.find((firm) => firm.id === id)).filter((firm): firm is Firm => Boolean(firm)), userPos),
    [route, firms, userPos],
  );
  const routeLine = useMemo(() => [...(userPos ? [userPos] : []), ...routePlan.ordered.map((firm) => firm.pos)], [userPos, routePlan.ordered]);
  const pins = useMemo<MapPin[]>(
    () =>
      filtered.map((firm) => ({
        id: firm.id,
        title: firm.name,
        subtitle: `${FIRM_TYPE_LABEL[firm.firmType]} · ${place(firm)}${firm.distanceKm != null ? ` · ${firm.distanceKm.toFixed(0)} km` : ''}`,
        latitude: firm.pos.lat,
        longitude: firm.pos.lng,
        tone: FIRM_TYPE_TONE[firm.firmType],
      })),
    [filtered],
  );
  const typeCounts = useMemo(() => {
    const counts: Record<FirmType, number> = { customer: 0, supplier_customer: 0, supplier: 0, competitor: 0 };
    for (const firm of firms) counts[firm.firmType] += 1;
    return counts;
  }, [firms]);
  const menuFirm = menuFirmId ? firms.find((firm) => firm.id === menuFirmId) ?? null : null;
  const unmapped = rows.length - firms.length;

  // Saha hatırlatması: bildirim yalnız konum gerçekten GPS'ten geldiyse üretilir (web ile aynı).
  const nearbyMutate = nearby.mutate;
  useEffect(() => {
    if (!userPos) {
      setStale([]);
      return;
    }
    const notify = geoSource === 'gps';
    nearbyMutate(
      { latitude: userPos.lat, longitude: userPos.lng, notify },
      {
        onSuccess: (response) => {
          setStale(response.companies);
          if (notify && response.companies.length > 0) {
            toast.success(`Yakınınızda ${response.companies.length} firma ${response.staleDays}+ gündür ziyaret edilmemiş`);
          }
        },
        onError: () => setStale([]),
      },
    );
  }, [userPos, geoSource, nearbyMutate]);

  async function locate() {
    setPick(null);
    setLocating(true);
    setGeoMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setGeoMessage('Konum izni verilmedi. İlinizi seçerek veya haritadan nokta seçerek devam edebilirsiniz.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPos({ lat: current.coords.latitude, lng: current.coords.longitude });
      setAccuracy(current.coords.accuracy ?? null);
      setGeoSource('gps');
      setProvince('');
    } catch {
      setGeoMessage('Konum alınamadı. İlinizi seçerek devam edebilirsiniz.');
    } finally {
      setLocating(false);
    }
  }

  function selectProvince(name: string | null) {
    const center = name ? centroidForProvince(name) : null;
    if (!name || !center) return;
    setProvince(name);
    setUserPos(center);
    setAccuracy(null);
    setGeoSource('province');
    setGeoMessage(null);
    setPick(null);
  }

  function clearLocation() {
    setUserPos(null);
    setGeoSource(null);
    setProvince('');
    setAccuracy(null);
    setRadius('all');
    setPick(null);
  }

  function handleMapPick(pos: LatLng) {
    if (!pick) return;
    if (pick.type === 'user') {
      setUserPos(pos);
      setProvince('');
      setAccuracy(null);
      setGeoSource('manual_pin');
      setPick(null);
      return;
    }
    const id = pick.id;
    setPick(null);
    setFocusId(id);
    setLocation.mutate(
      { id, latitude: pos.lat, longitude: pos.lng, source: 'manual' },
      {
        onSuccess: () => toast.success('Firma konumu kaydedildi'),
        onError: (error) => toast.error(`Konum kaydedilemedi · ${error.message}`),
      },
    );
  }

  function resetPin(id: string) {
    setLocation.mutate(
      { id, latitude: null, longitude: null },
      {
        onSuccess: () => toast.success('Firma konumu yaklaşık merkeze döndü'),
        onError: (error) => toast.error(`Konum sıfırlanamadı · ${error.message}`),
      },
    );
  }

  function applyOsm(row: CompanyListRow, result: CompanyOsmSearchResult) {
    const name = row.shortName || row.legalTitle;
    setLocation.mutate(
      { id: row.id, latitude: result.latitude, longitude: result.longitude, source: osmSourceFor(result.matchQuality) },
      {
        onSuccess: () => {
          toast.success(
            result.matchQuality === 'exact'
              ? `Doğrulanmış OpenStreetMap konumu kaydedildi · ${name}`
              : `Yaklaşık OpenStreetMap konumu kaydedildi · ${name} · Tam pin için haritadan firma girişini seçin.`,
          );
          setOsmFirmId(null);
          setFocusId(row.id);
        },
        onError: (error) => toast.error(`Konum kaydedilemedi · ${error.message}`),
      },
    );
  }

  const toggleRoute = (id: string) => setRoute((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  function startPick(next: PickMode) {
    setPick(next);
    if (next && mapAvailable) setView('map');
    if (next?.type === 'firm') toast.success('Haritada firma noktasını seçin · Doğru noktaya dokununca koordinat firmaya kalıcı yazılır.');
  }

  function openRoute(provider: 'google' | 'apple') {
    const points = routeLine;
    const url = provider === 'google' ? googleRouteUrl(points) : appleRouteUrl(points, Boolean(userPos));
    if (url) void Linking.openURL(url);
  }

  function openFirmMenu(id: string) {
    setMenuFirmId(id);
    menuRef.current?.present();
  }

  const menuItems: SheetMenuItem[] = menuFirm
    ? [
        { key: 'open', label: 'Firma kartını aç', icon: 'business-outline', onPress: () => router.push(`/(tabs)/modules/companies/${menuFirm.id}` as Href) },
        {
          key: 'route',
          label: route.includes(menuFirm.id) ? 'Rotadan çıkar' : 'Rotaya ekle',
          icon: route.includes(menuFirm.id) ? 'remove-circle-outline' : 'add-circle-outline',
          onPress: () => toggleRoute(menuFirm.id),
        },
        { key: 'directions', label: 'Yol tarifi', icon: 'navigate-outline', onPress: () => void Linking.openURL(directionsUrl(menuFirm.pos)) },
        ...(menuFirm.row.primaryPhone
          ? [
              {
                key: 'call',
                label: `Ara · ${menuFirm.row.primaryPhone}`,
                icon: 'call-outline' as const,
                onPress: () => void Linking.openURL(`tel:${menuFirm.row.primaryPhone!.replace(/[^\d+]/g, '')}`),
              },
            ]
          : []),
        {
          key: 'visit',
          label: 'Ziyaret kaydet',
          icon: 'calendar-outline',
          onPress: () => router.push(`/modal/visit-new?companyId=${menuFirm.id}&companyName=${encodeURIComponent(menuFirm.name)}` as Href),
        },
        ...(mapAvailable
          ? [{ key: 'pin', label: 'Pin düzelt', icon: 'locate-outline' as const, hint: 'Haritada doğru noktaya dokunun', onPress: () => startPick({ type: 'firm', id: menuFirm.id }) }]
          : []),
        ...(menuFirm.locationQuality === 'exact'
          ? [{ key: 'reset', label: 'Yaklaşık konuma dön', icon: 'refresh-outline' as const, onPress: () => resetPin(menuFirm.id) }]
          : []),
      ]
    : [];

  const header = (
    <View className="gap-3 pb-3">
      <Card className="gap-3">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={locating ? 'Konum alınıyor…' : userPos && geoSource === 'gps' ? 'Konumumu yenile' : 'GPS ile bul'}
              variant="ghost"
              loading={locating}
              onPress={() => void locate()}
            />
          </View>
          {mapAvailable ? (
            <View className="flex-1">
              <Button
                label={pick?.type === 'user' ? 'Seçimi iptal' : 'Haritadan seç'}
                variant="ghost"
                onPress={() => startPick(pick?.type === 'user' ? null : { type: 'user' })}
              />
            </View>
          ) : null}
        </View>
        <OptionPicker
          label="Konumum"
          icon="pin-outline"
          placeholder="veya ilinizi seçin (konumum)"
          value={province || null}
          options={PROVINCE_NAMES.map((name) => ({ value: name, label: name }))}
          searchable
          onChange={selectProvince}
        />
        {geoMessage ? <Text className="font-inter text-xs text-warning">{geoMessage}</Text> : null}
        {userPos && geoSource ? (
          <Text className="font-inter text-xs text-muted-foreground">
            Konum: <Text className="font-inter-semibold text-foreground">{province || SOURCE_LABEL[geoSource]}</Text>
            {geoSource === 'province' ? ' · yaklaşık il merkezi' : ''}
            {accuracy ? ` · ${accuracy < 1000 ? `${Math.round(accuracy)} m` : `${(accuracy / 1000).toFixed(1)} km`} doğruluk` : ''}
          </Text>
        ) : null}
        <View className="gap-2">
          <Text className="font-inter-medium text-sm text-foreground">Mesafe</Text>
          <View className="flex-row flex-wrap gap-2">
            {RADIUS_OPTIONS.map((option) => {
              const active = radius === option.value;
              const disabled = !userPos && option.value !== 'all';
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled }}
                  accessibilityLabel={option.label}
                  disabled={disabled}
                  onPress={() => setRadius(option.value)}
                  className={`min-h-11 justify-center rounded-full border px-3 ${active ? 'border-primary bg-secondary' : 'border-border bg-card'} ${disabled ? 'opacity-40' : ''}`}
                >
                  <Text className={`font-inter-medium text-xs ${active ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {userPos ? <Button label="Konumu temizle" variant="ghost" onPress={clearLocation} /> : null}
      </Card>

      <Text className="px-0.5 font-inter text-xs text-muted-foreground">
        <Text className="font-inter-semibold text-foreground">{filtered.length}</Text>
        {userPos ? ' firma yakınlık sırasıyla' : ' firma haritada'} · toplam {rows.length} firma
        {unmapped > 0 ? ` · ${unmapped} firma konumsuz` : ''}
      </Text>

      {stale.length > 0 ? (
        <Card className="gap-2 border-warning-border bg-warning-soft">
          <View className="flex-row items-center gap-2">
            <Ionicons name="notifications-outline" size={16} color={colors.warning} />
            <Text className="flex-1 font-inter-semibold text-sm text-foreground">Yakında · uzun süredir uğranmadı</Text>
            <Chip tone="warning" label={String(stale.length)} />
          </View>
          <Text className="font-inter text-xs text-muted-foreground">Yalnızca haritada kayıtlı gerçek koordinatı olan firmalar değerlendirilir.</Text>
          {stale.map((firm) => (
            <View key={firm.id} className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${firm.name} haritada göster`}
                onPress={() => {
                  setFocusId(firm.id);
                  if (mapAvailable) setView('map');
                }}
                className="min-h-11 flex-1 justify-center"
              >
                <Text numberOfLines={1} className="font-inter-medium text-sm text-foreground">{firm.name}</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {firm.distanceKm} km · {firm.daysSinceVisit == null ? 'hiç ziyaret kaydı yok' : `${firm.daysSinceVisit} gündür uğranmadı`}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${firm.name} ziyaret kaydet`}
                onPress={() => router.push(`/modal/visit-new?companyId=${firm.id}&companyName=${encodeURIComponent(firm.name)}` as Href)}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="calendar-outline" size={18} color={colors.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={route.includes(firm.id) ? `${firm.name} rotadan çıkar` : `${firm.name} rotaya ekle`}
                onPress={() => toggleRoute(firm.id)}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name={route.includes(firm.id) ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={colors.primary} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      {routePlan.ordered.length > 0 ? (
        <Card className="gap-2 border-primary">
          <View className="flex-row items-center gap-2">
            <Ionicons name="git-branch-outline" size={16} color={colors.primary} />
            <Text className="font-inter-semibold text-sm text-foreground">Ziyaret rotası</Text>
            <Chip tone="info" label={`${routePlan.ordered.length} durak`} />
            <View className="flex-1" />
            <Pressable accessibilityRole="button" accessibilityLabel="Rotayı temizle" onPress={() => setRoute([])} className="min-h-11 justify-center px-2">
              <Text className="font-inter-medium text-xs text-muted-foreground">Temizle</Text>
            </Pressable>
          </View>
          {routePlan.ordered.map((firm, index) => (
            <View key={firm.id} className="flex-row items-center gap-2">
              <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                <Text className="font-inter-semibold text-[11px] text-primary-foreground">{index + 1}</Text>
              </View>
              <Text numberOfLines={1} className="flex-1 font-inter text-sm text-foreground">{firm.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${firm.name} rotadan çıkar`} onPress={() => toggleRoute(firm.id)} className="h-11 w-11 items-center justify-center">
                <Ionicons name="close" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <Text className="font-inter text-xs text-muted-foreground">
            {userPos ? `Konumunuzdan toplam ~${routePlan.totalKm.toFixed(0)} km` : 'Toplam mesafe için kendi konumunuzu ayarlayın'}
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Google Haritalar" onPress={() => openRoute('google')} />
            </View>
            {Platform.OS === 'ios' ? (
              <View className="flex-1">
                <Button label="Apple Haritalar" variant="ghost" onPress={() => openRoute('apple')} />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );

  const footer =
    withoutPin.length > 0 ? (
      <Card className="mt-3 gap-3">
        <View>
          <Text className="font-inter-semibold text-sm text-foreground">Doğrulanmış tam pini olmayan firmalar</Text>
          <Text className="font-inter text-xs text-muted-foreground">OSM sonuçları doğruluk seviyesine göre kaydedilir; ilçe merkezi tam pin sayılmaz.</Text>
        </View>
        {withoutPin.map((row) => (
          <View key={row.id} className="gap-2 border-t border-border pt-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Text numberOfLines={1} className="font-inter-medium text-sm text-foreground">{row.shortName || row.legalTitle}</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {[row.primaryAddress?.district, row.primaryAddress?.province].filter(Boolean).join(', ') || 'Adres bilgisi yok'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={osmFirmId === row.id ? 'OSM aramasını kapat' : `${row.legalTitle} OSM'de ara`}
                onPress={() => setOsmFirmId((current) => (current === row.id ? null : row.id))}
                className="min-h-11 justify-center rounded-control border border-border px-3"
              >
                <Text className="font-inter-medium text-xs text-foreground">{osmFirmId === row.id ? 'Kapat' : "OSM'de ara"}</Text>
              </Pressable>
            </View>
            {osmFirmId === row.id ? (
              <OsmSearchPanel
                query={row.shortName || row.legalTitle}
                address={row.primaryAddress?.fullAddress}
                city={row.primaryAddress?.province}
                district={row.primaryAddress?.district}
                buttonLabel="Ara"
                onSelect={(result) => applyOsm(row, result)}
              />
            ) : null}
            {mapAvailable && osmFirmId === row.id ? (
              <Button label="Haritadan seç" variant="ghost" onPress={() => startPick({ type: 'firm', id: row.id })} />
            ) : null}
          </View>
        ))}
      </Card>
    ) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title="Firma Haritası"
        subtitle={directory.data ? `${filtered.length} / ${rows.length} firma` : undefined}
        actions={
          mapAvailable
            ? [
                {
                  icon: view === 'map' ? 'list-outline' : 'map-outline',
                  label: view === 'map' ? 'Liste görünümü' : 'Harita görünümü',
                  onPress: () => setView((current) => (current === 'map' ? 'list' : 'map')),
                },
              ]
            : []
        }
      />
      <View className="gap-2 border-b border-border bg-card pb-2 pt-2">
        <View className="px-4">
          <SearchBar value={search} onChange={setSearch} placeholder="Firma adı / şehir ara..." />
        </View>
        <FilterChips
          allLabel="Tüm firmalar"
          options={FIRM_TYPES.map((type) => ({ value: type, label: FIRM_TYPE_LABEL[type], count: typeCounts[type] }))}
          value={firmType}
          onChange={setFirmType}
        />
        <View className="flex-row flex-wrap gap-x-3 gap-y-1 px-4" accessibilityLabel="Pin renkleri">
          {FIRM_TYPES.map((type) => (
            <View key={type} className="flex-row items-center gap-1">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: toneColor(colors, FIRM_TYPE_TONE[type]) }} />
              <Text className="font-inter text-[11px] text-muted-foreground">{FIRM_TYPE_LABEL[type]}</Text>
            </View>
          ))}
        </View>
      </View>

      {directory.isPending ? (
        <Loading />
      ) : directory.error ? (
        <ErrorState message={directory.error.message} onRetry={() => void directory.refetch()} />
      ) : view === 'map' && mapAvailable ? (
        <View className="flex-1">
          <CompanyMapSurface
            pins={pins}
            truncated={directory.data?.truncated}
            userPos={userPos}
            routeLine={routeLine}
            focusId={focusId}
            pickMode={Boolean(pick)}
            onPinPress={openFirmMenu}
            onMapPick={handleMapPick}
            onLocate={() => void locate()}
          />
          {pick ? (
            <View className="absolute bottom-6 left-4 right-20">
              <Button label="Seçimi iptal" variant="ghost" onPress={() => setPick(null)} />
            </View>
          ) : routePlan.ordered.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ziyaret rotasını göster"
              onPress={() => setView('list')}
              className="absolute bottom-6 left-4 min-h-11 flex-row items-center gap-2 rounded-full border border-primary bg-card px-4"
            >
              <Ionicons name="git-branch-outline" size={16} color={colors.primary} />
              <Text className="font-inter-medium text-sm text-foreground">
                {routePlan.ordered.length} durak{userPos ? ` · ~${routePlan.totalKm.toFixed(0)} km` : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={directory.isRefetching} onRefresh={() => void directory.refetch()} />}
          ListHeaderComponent={
            <>
              {!mapAvailable ? (
                <View className="mb-3 rounded-control border border-warning-border bg-warning-soft px-4 py-3">
                  <Text className="font-inter text-xs leading-5 text-foreground">
                    {Platform.OS === 'android'
                      ? 'Android haritası bu derlemede yapılandırılmamış. Firma konumları güvenli liste görünümünde kullanılabilir.'
                      : 'Harita bu platformda desteklenmiyor; firma konumları liste görünümünde gösteriliyor.'}
                  </Text>
                </View>
              ) : null}
              {header}
            </>
          }
          ListEmptyComponent={
            <EmptyState
              title="Bu filtreye uyan haritalanabilir firma yok."
              hint="Firma adresine il/ilçe veya koordinat eklendiğinde burada görünür."
            />
          }
          ListFooterComponent={footer}
          renderItem={({ item }) => (
            <View className="mb-2 flex-row items-center gap-2 rounded-overlay border border-border bg-card px-3 py-2.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name} işlemleri`}
                onPress={() => openFirmMenu(item.id)}
                className="min-h-11 flex-1 flex-row items-center gap-3"
              >
                <View className="h-9 w-9 items-center justify-center rounded-control" style={{ backgroundColor: toneColor(colors, FIRM_TYPE_TONE[item.firmType]) }}>
                  <Ionicons name="business" size={16} color={colors.card} />
                </View>
                <View className="flex-1 gap-1">
                  <Text numberOfLines={1} className="font-inter-semibold text-sm text-foreground">{item.name}</Text>
                  <Text numberOfLines={1} className="font-inter text-xs text-muted-foreground">{place(item)}</Text>
                  <Chip tone={LOCATION_QUALITY_TONE[item.locationQuality]} label={LOCATION_QUALITY_LABELS[item.locationQuality]} />
                </View>
                {item.distanceKm != null ? <Text className="font-inter-medium text-xs text-muted-foreground">{item.distanceKm.toFixed(0)} km</Text> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={route.includes(item.id) ? `${item.name} rotadan çıkar` : `${item.name} rotaya ekle`}
                onPress={() => toggleRoute(item.id)}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name={route.includes(item.id) ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={colors.primary} />
              </Pressable>
            </View>
          )}
        />
      )}

      <SheetMenu
        ref={menuRef}
        title={menuFirm?.name ?? 'Firma'}
        subtitle={
          menuFirm
            ? `${FIRM_TYPE_LABEL[menuFirm.firmType]} · ${place(menuFirm)}${menuFirm.distanceKm != null ? ` · ${menuFirm.distanceKm.toFixed(0)} km` : ''} · ${LOCATION_QUALITY_LABELS[menuFirm.locationQuality]}`
            : undefined
        }
        items={menuItems}
      />
    </SafeAreaView>
  );
}
