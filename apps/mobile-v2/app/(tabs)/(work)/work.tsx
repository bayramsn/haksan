import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaInsetsContext, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, Text, View } from 'react-native';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { request } from '@/src/api/client';
import { kv } from '@/src/offline/storage';
import { canAccessModule, modules } from '@/src/modules/catalog';
import { selectWorkKind, roleWorkDefault, workPreferenceKey, workOrder, type WorkKind } from '@/src/modules/work-policy';
import AssignedWork from '@/src/modules/AssignedWork';
import { validWorkPreference } from '@/src/modules/daily-work-policy';
import { EmptyState, Loading, ScreenHeader } from '@/src/ui';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { WorkScopeContext } from '@/src/modules/WorkScope';
import Opportunities from '../(today,work,calendar,modules,more)/modules/opportunities/index';
import Tickets from '../(today,work,calendar,modules,more)/modules/service-tickets/index';
import Shipments from '../(today,work,calendar,modules,more)/modules/shipments/index';
import DueDates from '../(today,work,calendar,modules,more)/modules/due-dates/index';

type TaskView = 'mine' | 'today' | 'overdue';
const parseTaskView = (value?: string): TaskView => (value === 'today' || value === 'overdue' ? value : 'mine');
const definitions: Record<WorkKind, { key: string; label: string; Screen: (props: { taskView: TaskView }) => React.JSX.Element }> = {
  tasks: { key: 'tasks', label: 'Görevlerim', Screen: ({ taskView }) => <AssignedWork kind="tasks" initialTaskView={taskView} /> },
  approvals: { key: 'quotes', label: 'Fiyat Onayları', Screen: () => <AssignedWork kind="approvals" /> },
  // Web'deki gibi tam pano (Kanban/Liste, filtre, arama); düz liste değil.
  sales: { key: 'opportunities', label: 'Fırsatlar', Screen: Opportunities },
  service: { key: 'service-tickets', label: 'Servis', Screen: Tickets },
  installations: { key: 'installations', label: 'Kurulum', Screen: () => <AssignedWork kind="installations" /> },
  operations: { key: 'shipments', label: 'Sevkiyat', Screen: Shipments },
  finance: { key: 'due-dates', label: 'Vade ve Tahsilat', Screen: DueDates },
};

export default function WorkScreen() {
  const { user, tenant, scope } = useAuth();
  const insets = useSafeAreaInsets();
  const kindSheet = useRef<BottomSheetModal>(null);
  const { colors } = useTheme();
  // n: her ana sayfa kısayolunda artar ki aynı görünüme ikinci dokunuş da listeyi sıfırlasın.
  const [shortcut, setShortcut] = useState<{ view: TaskView; n: number }>({ view: 'mine', n: 0 });
  const [scopeMode, setScopeMode] = useState<'mine' | 'all'>('mine');
  const router = useRouter();
  const { kind: requestedKind, view: requestedView } = useLocalSearchParams<{ kind?: string; view?: string }>();
  const canApprove = useCan('quotes.approve');
  const [choices, setChoices] = useState<Record<string, WorkKind>>({});
  const key = workPreferenceKey(user?.id ?? '', user?.tenantId ?? '', scope.divisionId, scope.departmentId);
  const allowed = workOrder.filter((kind) => {
    const entry = modules.find((item) => item.key === definitions[kind].key);
    return (kind !== 'approvals' || canApprove) && entry && canAccessModule(user, tenant, entry);
  });
  useEffect(() => {
    if (!requestedKind) return;
    if (allowed.includes(requestedKind as WorkKind)) {
      kv.set(key, requestedKind);
      setChoices((previous) => ({ ...previous, [key]: requestedKind as WorkKind }));
      if (requestedKind === 'tasks') setShortcut((previous) => ({ view: parseTaskView(requestedView), n: previous.n + 1 }));
    } else if (!allowed.length) return; // Yetkiler henüz yüklenmedi; kısayolu düşürme.
    // Consume a Today shortcut once; future tab visits retain the user's last choice.
    router.setParams({ kind: undefined, view: undefined });
  }, [requestedKind, key, allowed.join(','), router]);
  const assigned = useQuery({
    queryKey: ['work', 'assigned', key, allowed.join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled([
        allowed.includes('tasks') ? request<{ mine: number }>('/tasks/counts') : Promise.resolve(null),
        allowed.includes('approvals') ? request<{ meta: { total: number } }>('/quotes', { query: { page: 1, pageSize: 1, statusCode: 'pending_super_admin_approval' } }) : Promise.resolve(null),
        allowed.includes('sales')
          ? request<{ meta: { total: number } }>('/opportunities', { query: { page: 1, pageSize: 1, view: 'active', ownerUserId: user!.id } })
          : Promise.resolve(null),
        allowed.includes('service')
          ? request<{ open: number }>('/service-tickets/summary', { query: { assignedToUserId: user!.id } })
          : Promise.resolve(null),
        allowed.includes('installations') ? Promise.all((['planned', 'ongoing'] as const).map((phase) => request<{ meta: { total: number } }>('/installations', { query: { page: 1, pageSize: 1, phase, assignedToUserId: user!.id } }))) : Promise.resolve(null),
      ]);
      const kinds = ['tasks', 'approvals', 'sales', 'service', 'installations'] as const;
      const counts: Partial<Record<WorkKind, number>> = {};
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const value = result.value;
        const kind = kinds[index];
        if (!kind) return;
        counts[kind] = Array.isArray(value) ? value.reduce((sum, row) => sum + row.meta.total, 0)
          : 'mine' in value ? value.mine : 'open' in value ? value.open : value.meta.total;
      });
      return { counts, incomplete: results.some((result) => result.status === 'rejected') };
    },
    enabled: Boolean(user && allowed.length),
  });
  useFocusEffect(useCallback(() => { if (user && allowed.length) void assigned.refetch(); }, [key, allowed.join(',')]));
  const counts = assigned.data?.counts ?? {};
  const saved = choices[key] ?? (requestedKind && allowed.includes(requestedKind as WorkKind) ? requestedKind : undefined) ?? kv.getString(key);
  const hasSavedChoice = validWorkPreference(allowed, saved);
  const selected = selectWorkKind(allowed, saved, counts, roleWorkDefault(user?.roles ?? []));
  useEffect(() => {
    if (!selected || hasSavedChoice || !assigned.isSuccess || assigned.data.incomplete) return;
    kv.set(key, selected);
    setChoices((previous) => ({ ...previous, [key]: selected }));
  }, [selected, hasSavedChoice, assigned.isSuccess, assigned.data, key]);
  const icons: Record<WorkKind, keyof typeof Ionicons.glyphMap> = { sales: 'briefcase-outline', service: 'construct-outline', installations: 'build-outline', operations: 'cube-outline', finance: 'wallet-outline', tasks: 'checkbox-outline', approvals: 'checkmark-circle-outline' };
  const select = (kind: WorkKind) => { kv.set(key, kind); setChoices((previous) => ({ ...previous, [key]: kind })); setShortcut((previous) => ({ ...previous, view: 'mine' })); };
  const personalSwitch = selected === 'sales' || selected === 'service';
  // Parametre gelir gelmez doğru görünümle aç; efekt sonrası anahtar aynı kalır, ikinci yükleme olmaz.
  const pendingView = requestedKind === 'tasks' && allowed.includes('tasks') ? parseTaskView(requestedView) : null;
  const taskView = pendingView ?? shortcut.view;
  const screenKey = `${key}:${selected}:${scopeMode}${selected === 'tasks' ? `:${pendingView ? shortcut.n + 1 : shortcut.n}` : ''}`;
  const Screen = selected ? definitions[selected].Screen : null;
  return <SafeAreaView edges={['left', 'right']} className="flex-1 bg-canvas">
    <ScreenHeader title="İşler" />
    {!selected ? <EmptyState title="Erişilebilir iş alanı yok" hint="Yetkiniz olan diğer alanlara Modüller sekmesinden ulaşabilirsiniz." />
      : !hasSavedChoice && assigned.isPending ? <Loading /> : <>
        <View className="gap-2 px-4 pb-3 pt-2">
          <Text className="font-inter-medium text-sm text-muted-foreground">İş alanı</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`İş alanı: ${definitions[selected].label}. Değiştir`} onPress={() => kindSheet.current?.present()}
            className="min-h-11 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Ionicons name={icons[selected]} size={20} color={colors.primary} />
            <Text className="flex-1 font-inter-semibold text-base text-foreground">{definitions[selected].label}</Text>
            {counts[selected] != null ? <Text className="font-inter text-sm text-muted-foreground">{counts[selected]} açık</Text> : null}
            <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <BottomSheetModal ref={kindSheet} snapPoints={['65%']} enableDynamicSizing={false} backgroundStyle={{ backgroundColor: colors.card }} handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }} backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}>
          <BottomSheetScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 8 }}>
            <Text accessibilityRole="header" className="pb-2 font-inter-semibold text-lg text-foreground">İş alanını seçin</Text>
            {allowed.map((kind) => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: kind === selected }} onPress={() => { select(kind); kindSheet.current?.dismiss(); }} className={`min-h-11 flex-row items-center gap-3 rounded-xl px-4 py-3 ${kind === selected ? 'bg-muted' : ''}`}>
              <Ionicons name={icons[kind]} size={20} color={colors.primary} />
              <Text className="flex-1 font-inter-medium text-base text-foreground">{definitions[kind].label}</Text>
              {counts[kind] != null ? <Text className="font-inter text-sm text-muted-foreground">{counts[kind]}</Text> : null}
              {kind === selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </Pressable>)}
          </BottomSheetScrollView>
        </BottomSheetModal>
        {personalSwitch || assigned.error || assigned.data?.incomplete ? <View className="gap-2 px-4 pb-2">
          {personalSwitch ? <View accessibilityRole="tablist" className="flex-row rounded-xl bg-muted p-1">
            {(['mine', 'all'] as const).map((mode) => <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: mode === scopeMode }} onPress={() => setScopeMode(mode)} className={`min-h-11 flex-1 items-center justify-center rounded-lg px-2 py-2 ${mode === scopeMode ? 'bg-card' : ''}`}>
              <Text className={`font-inter-medium text-[13px] text-center ${mode === scopeMode ? 'text-foreground' : 'text-muted-foreground'}`}>{mode === 'mine' ? 'Bana atanan' : 'Tüm erişebildiklerim'}</Text>
            </Pressable>)}
          </View> : null}
          {assigned.error || assigned.data?.incomplete ? <Pressable accessibilityRole="button" onPress={() => void assigned.refetch()} className="min-h-11 justify-center"><Text className="font-inter text-sm text-primary">Bazı iş adetleri alınamadı · Yenile</Text></Pressable> : null}
        </View> : null}
        <WorkScopeContext.Provider value={{ assignedUserId: !personalSwitch || scopeMode === 'mine' ? user?.id : undefined }}>
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0, left: 0, right: 0 }}>
            {Screen ? <Screen key={screenKey} taskView={taskView} /> : null}
          </SafeAreaInsetsContext.Provider>
        </WorkScopeContext.Provider>
      </>}
  </SafeAreaView>;
}
