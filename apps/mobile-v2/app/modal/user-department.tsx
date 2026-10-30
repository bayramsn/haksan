import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PERMISSION_RESOURCES, type UserUpdateInput } from '@haksan/shared';
import { useAdminDepartments, useAdminDivisions, useAdminUsers, useUpdateUser } from '@/src/api/admin.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { chipClass, chipTextClass, useTheme } from '@/src/theme/theme';
import { Button, Card, Eyebrow } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import {
  initialAccessScopes,
  moveScopesToDepartment,
  resourceLabel,
  toggleOrdered,
  updateScopeRow,
  type AccessScopeRow,
} from '@/src/ui/admin/admin-model';
import { ActionPill, ChipSelect, MultiChipSelect, SwitchRow } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

type Option = { value: string; label: string };

/** Uzun seçenek listesi (30+ sayfa) için yatay kaydırmalı tek seçim. */
function ScrollChips({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-[11px] text-muted-foreground">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
        {options.map((option) => {
          const active = option.value === value;
          const tone = active ? 'info' : 'neutral';
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              className={`min-h-11 justify-center rounded-full border px-3 ${chipClass[tone]} active:opacity-60`}
            >
              <Text className={`font-inter-medium text-[13px] ${chipTextClass[tone]}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const ALL = '__all__';
const RESOURCE_OPTIONS: Option[] = PERMISSION_RESOURCES.map((code) => ({ value: code, label: resourceLabel(code) }));

export default function UserDepartmentModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAdminAccess();
  const allowed = access.isAdmin && access.has('users.update');
  const users = useAdminUsers(allowed);
  const departments = useAdminDepartments(allowed);
  const divisions = useAdminDivisions(allowed);
  const titles = useLookup('user-titles', allowed);
  const update = useUpdateUser();
  const user = users.data?.find((row) => row.id === id);

  const [departmentId, setDepartmentId] = useState('');
  const [titleId, setTitleId] = useState('');
  const [active, setActive] = useState(true);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<AccessScopeRow[]>([]);
  const [openScope, setOpenScope] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const divisionList = user.divisions.slice().sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((d) => d.id);
    setDepartmentId(user.departmentId ?? '');
    setTitleId(user.titleId ?? '');
    setActive(user.status !== 'passive');
    setDivisionIds(divisionList);
    setScopes(initialAccessScopes(PERMISSION_RESOURCES, user.accessScopes, user.departmentId, divisionList));
  }, [user]);

  const departmentOptions: Option[] = (departments.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const divisionOptions: Option[] = (divisions.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const departmentName = (value: string | null) => (value ? departmentOptions.find((d) => d.value === value)?.label ?? '—' : 'Tüm Departmanlar');
  const divisionName = (value: string | null) => (value ? divisionOptions.find((d) => d.value === value)?.label ?? '—' : 'Tümü');

  const changeDepartment = (next: string) => {
    const previous = departmentId || null;
    setDepartmentId(next);
    setScopes((rows) => moveScopesToDepartment(rows, previous, next || null));
  };

  const addScope = () => {
    setScopes((rows) => [
      ...rows,
      { resource: RESOURCE_OPTIONS[0]?.value ?? 'companies', departmentId: departmentId || null, divisionId: divisionIds[0] ?? null, isPrimary: false },
    ]);
    setOpenScope(scopes.length);
  };

  const save = () => {
    if (!user) return;
    update.mutate(
      {
        id: user.id,
        body: {
          departmentId: departmentId || null,
          titleId: titleId || null,
          status: active ? 'active' : 'passive',
          divisionIds,
          accessScopes: scopes as UserUpdateInput['accessScopes'],
        },
      },
      {
        onSuccess: () => {
          toast.success('Kullanıcı güncellendi');
          router.back();
        },
        onError: (err) => toast.error(`Güncellenemedi: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title={user ? `Departman & Bölüm · ${user.fullName}` : 'Departman & Bölüm'}
      allowed={allowed}
      loading={users.isPending || departments.isPending || divisions.isPending}
      error={users.error?.message ?? departments.error?.message ?? divisions.error?.message ?? (users.data && !user ? 'Kullanıcı bulunamadı' : null)}
      onRetry={() => {
        void users.refetch();
        void departments.refetch();
        void divisions.refetch();
      }}
      description={user?.email}
    >
      <ChipSelect label="Departman" options={[{ value: '', label: '— Atanmadı —' }, ...departmentOptions]} value={departmentId} onChange={changeDepartment} />
      <View className="gap-1.5">
        <ChipSelect
          label="Ünvan"
          options={[{ value: '', label: '— Atanmadı —' }, ...(titles.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          value={titleId}
          onChange={setTitleId}
        />
        <Help>Teklif, proforma ve sözleşme çıktılarında kullanıcının isminin altında yazar.</Help>
      </View>
      {divisionOptions.length ? (
        <MultiChipSelect
          label="Bölüm (CNC / Üniversal / Sac İşleme)"
          hint="İlk seçilen, varsayılan aktif bölüm olur. Boş bırakılırsa kullanıcı ticari veri görmez."
          options={divisionOptions}
          values={divisionIds}
          onToggle={(value, checked) => setDivisionIds((prev) => toggleOrdered(prev, value, checked))}
          badgeFor={(value) => (divisionIds[0] === value ? 'Birincil' : null)}
        />
      ) : null}

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Eyebrow>Yetki Alanları</Eyebrow>
          <ActionPill icon="add" label="Kapsam Ekle" onPress={addScope} disabled={update.isPending} />
        </View>
        {scopes.map((scope, index) => {
          const open = openScope === index;
          return (
            <Card key={`${scope.resource}-${index}`} className="gap-2 p-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${resourceLabel(scope.resource)} kapsamını ${open ? 'kapat' : 'düzenle'}`}
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenScope(open ? null : index)}
                className="min-h-11 flex-row items-center gap-2 active:opacity-70"
              >
                <View className="flex-1">
                  <Text className="font-inter-semibold text-[14px] text-foreground">{resourceLabel(scope.resource)}</Text>
                  <Text className="font-inter text-[12px] text-muted-foreground">
                    {departmentName(scope.departmentId)} · {divisionName(scope.divisionId)}
                    {scope.isPrimary ? ' · Birincil' : ''}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </Pressable>
              {open ? (
                <View className="gap-3">
                  <ScrollChips label="Sayfa" options={RESOURCE_OPTIONS} value={scope.resource} onChange={(v) => setScopes((rows) => updateScopeRow(rows, index, { resource: v }))} />
                  <ScrollChips
                    label="Departman"
                    options={[{ value: ALL, label: 'Tüm Departmanlar' }, ...departmentOptions]}
                    value={scope.departmentId ?? ALL}
                    onChange={(v) => setScopes((rows) => updateScopeRow(rows, index, { departmentId: v === ALL ? null : v }))}
                  />
                  <ScrollChips
                    label="Bölüm"
                    options={[{ value: ALL, label: 'Tümü' }, ...divisionOptions]}
                    value={scope.divisionId ?? ALL}
                    onChange={(v) => setScopes((rows) => updateScopeRow(rows, index, { divisionId: v === ALL ? null : v }))}
                  />
                  <SwitchRow
                    title="Birincil kapsam"
                    value={scope.isPrimary}
                    onValueChange={(v) => setScopes((rows) => updateScopeRow(rows, index, { isPrimary: v }))}
                  />
                  <View className="flex-row">
                    <ActionPill
                      icon="trash-outline"
                      tone="destructive"
                      label="Sil"
                      disabled={scopes.length <= 1}
                      onPress={() => {
                        setScopes((rows) => rows.filter((_, i) => i !== index));
                        setOpenScope(null);
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      <SwitchRow title="Aktif hesap" subtitle="Pasif kullanıcılar giriş yapamaz" value={active} onValueChange={setActive} />
      <Button label="Kaydet" loading={update.isPending} disabled={!user} onPress={save} />
    </ModalShell>
  );
}
