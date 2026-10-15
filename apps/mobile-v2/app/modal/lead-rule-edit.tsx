import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminUsers } from '@/src/api/admin.hooks';
import { useCreateLeadRule, useLeadRules, useUpdateLeadRule } from '@/src/api/settings.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { CheckRow, ChipSelect, Notice } from '@/src/ui/admin/controls';
import {
  LEAD_RULE_ALL_DIVISIONS,
  activeSalesUsers,
  changeLeadRuleDivision,
  emptyLeadRuleForm,
  leadRuleFormToBody,
  leadRuleToForm,
  salesUsersForDivision,
  type LeadRuleForm,
} from '@/src/ui/admin/lead-rule-model';
import { ModalShell } from '@/src/ui/admin/ModalShell';
import { DISTRICTS_BY_PROVINCE } from '@haksan/shared';
import { useLookup } from '@/src/api/crm.hooks';
import { TokenSelect } from '@/src/ui/select/TokenSelect';
import { provinceOptions } from '@/src/ui/select/select-logic';

const PROVINCE_ITEMS = provinceOptions(Object.keys(DISTRICTS_BY_PROVINCE));

export default function LeadRuleEditModal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const sources = useLookup('contact-sources');
  const sourceItems = useMemo(() => (sources.data ?? []).map((row) => ({ id: row.code, label: row.name })), [sources.data]);
  const access = useAdminAccess();
  const allowed = access.has('lead_assignment_rules.manage');
  const canReadUsers = access.has('users.read');
  const rules = useLeadRules(allowed);
  const users = useAdminUsers(allowed && canReadUsers);
  const create = useCreateLeadRule();
  const update = useUpdateLeadRule();
  const editing = id ? rules.data?.find((rule) => rule.id === id) : undefined;
  const [form, setForm] = useState<LeadRuleForm>(emptyLeadRuleForm);

  useEffect(() => {
    if (editing) setForm(leadRuleToForm(editing));
  }, [editing]);

  const sales = useMemo(() => activeSalesUsers(users.data ?? []), [users.data]);
  const selectable = useMemo(() => salesUsersForDivision(sales, form.divisionId), [sales, form.divisionId]);
  const saving = create.isPending || update.isPending;
  const set = (patch: Partial<LeadRuleForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = () => {
    if (!form.name.trim() || !form.assigneeUserIds.length) {
      toast.error('Kural adı ve en az bir satış kullanıcısı zorunlu');
      return;
    }
    const body = leadRuleFormToBody(form, editing?.active ?? true);
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Atama kuralı güncellendi' : 'Atama kuralı oluşturuldu');
        router.back();
      },
      onError: (err: Error) => toast.error(`Atama kuralı kaydedilemedi: ${err.message}`),
    };
    if (editing) update.mutate({ id: editing.id, body }, handlers);
    else create.mutate(body, handlers);
  };

  return (
    <ModalShell
      title={id ? 'Fırsat atama kuralını düzenle' : 'Yeni fırsat atama kuralı'}
      allowed={allowed}
      loading={(!!id && rules.isPending) || (canReadUsers && users.isPending)}
      error={
        id && rules.error
          ? rules.error.message
          : id && rules.data && !editing
            ? 'Kural bulunamadı'
            : users.error
              ? `Kullanıcılar alınamadı: ${users.error.message}`
              : null
      }
      onRetry={() => {
        void rules.refetch();
        void users.refetch();
      }}
      description="Boş bırakılan kriter tüm değerlerle eşleşir. Düşük öncelik numarası önce çalışır."
    >
      <Field label="Kural adı" value={form.name} onChangeText={(name) => set({ name })} maxLength={255} editable={!saving} />
      <Field
        label="Öncelik"
        value={form.priority}
        onChangeText={(priority) => set({ priority: priority.replace(/[^\d]/g, '') })}
        keyboardType="number-pad"
        maxLength={5}
        editable={!saving}
      />
      <ChipSelect
        label="Bölüm"
        options={[
          { value: LEAD_RULE_ALL_DIVISIONS, label: 'Tüm bölümler' },
          ...(user?.divisions ?? []).map((d) => ({ value: d.id, label: d.name })),
        ]}
        value={form.divisionId}
        onChange={(divisionId) => setForm((current) => changeLeadRuleDivision(current, divisionId, sales))}
        disabled={saving}
      />
      <TokenSelect
        label="Şehirler"
        icon="location-outline"
        value={form.cities}
        onChange={(cities) => set({ cities })}
        options={PROVINCE_ITEMS}
        allowCustom
        disabled={saving}
      />
      <Field label="Ürün terimleri" value={form.products} onChangeText={(products) => set({ products })} placeholder="CNC, torna" editable={!saving} />
      <TokenSelect
        label="Kaynaklar"
        icon="call-outline"
        value={form.sources}
        onChange={(sources) => set({ sources })}
        options={sourceItems}
        optionsLoading={sources.isPending}
        allowCustom
        disabled={saving}
      />
      <View className="gap-2">
        <Eyebrow>Round-robin satış kullanıcıları</Eyebrow>
        {!canReadUsers ? (
          <Notice tone="warning">Satış kullanıcılarını listelemek için kullanıcı görüntüleme yetkisi gerekir.</Notice>
        ) : selectable.length === 0 ? (
          <Notice tone="info">Bu bölümde aktif satış kullanıcısı bulunamadı.</Notice>
        ) : (
          selectable.map((candidate) => {
            const checked = form.assigneeUserIds.includes(candidate.id);
            const order = form.assigneeUserIds.indexOf(candidate.id);
            return (
              <CheckRow
                key={candidate.id}
                title={candidate.fullName}
                subtitle={candidate.email}
                checked={checked}
                badge={checked ? `${order + 1}. sıra` : undefined}
                disabled={saving}
                onToggle={() =>
                  set({
                    assigneeUserIds: checked
                      ? form.assigneeUserIds.filter((value) => value !== candidate.id)
                      : [...form.assigneeUserIds, candidate.id],
                  })
                }
              />
            );
          })
        )}
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Vazgeç" variant="ghost" disabled={saving} onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button label={saving ? 'Kaydediliyor…' : 'Kuralı kaydet'} loading={saving} onPress={save} />
        </View>
      </View>
    </ModalShell>
  );
}
