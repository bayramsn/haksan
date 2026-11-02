import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { requestContextKey } from '@/src/api/client';
import type { TradeFairFlags } from '@/src/api/trade-fairs.api';
import { useCachedTradeFair, useTradeFairAction, useTradeFairDivisions } from '@/src/api/trade-fairs.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState } from '@/src/ui';
import { ChoiceChips, ModalForm } from '@/src/ui/documents/pickers';
import { CompanySelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { createTradeFairActionGuard, followUpDraft, saveTradeFairFlags } from '@/src/ui/trade-fairs/tradeFairLogic';

function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      className="min-h-[44px] flex-row items-center gap-2.5 active:opacity-60"
    >
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={22} color={value ? colors.primary : colors.mutedForeground} />
      <Text className="font-inter text-[15px] text-foreground">{label}</Text>
    </Pressable>
  );
}

export default function TradeFairFollowUpModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const isManager = Boolean(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
  const canUpdate = useCan('trade_fairs.update') || isManager;
  const canReadCompany = useCan('companies.read');
  const canCreateCompany = useCan('companies.create');
  const canCreateContact = useCan('contacts.create');
  const canCreateOpportunity = useCan('opportunities.create');
  const canUpdateOpportunity = useCan('opportunities.update');
  const row = useCachedTradeFair(params.id);
  const divisions = useTradeFairDivisions();
  const [divisionId, setDivisionId] = useState(row?.divisionId ?? '');
  const [form, setForm] = useState<TradeFairFlags>(() => row ? followUpDraft(row) : { called: false, quoted: false });
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stage, setStage] = useState<'lead' | 'c' | 'b' | 'a' | 'a_plus'>('lead');
  const action = useTradeFairAction();
  const [busy, setBusy] = useState(false);
  const guard = useRef(createTradeFairActionGuard(requestContextKey(), requestContextKey)).current;
  const baseline = useRef({ ...form });
  const completed = useRef(new Set<'company' | 'opportunity'>());
  useEffect(() => { guard.activate(); return () => guard.dispose(); }, [guard]);
  const [companyDone, setCompanyDone] = useState(false);
  const [opportunityDone, setOpportunityDone] = useState(false);

  if (!row) return <ModalForm title="Fuar Takibi" submitLabel="Kapat" onSubmit={() => router.back()}><EmptyState title="Kayıt bulunamadı" hint="Listeyi yenileyip tekrar açın." /></ModalForm>;

  const submit = async () => {
    if (!canUpdate || !guard.begin()) return;
    setBusy(true);
    try {
      const current = await saveTradeFairFlags(form, baseline.current, (flag, value) => action.mutateAsync({ kind: flag, id: row.id, value }), guard.isCurrent);
      if (!current) return;
      toast.success('Fuar takibi kaydedildi');
      router.back();
    } catch (error) {
      if (guard.isCurrent()) toast.error(error instanceof Error ? error.message : 'Takip kaydedilemedi. Tekrar deneyin.');
    } finally { guard.finish(); if (guard.isCurrent()) setBusy(false); }
  };

  const convert = (kind: 'company' | 'opportunity') => {
    if (!canUpdate || busy || !guard.isCurrent() || completed.current.has(kind)) return;
    Alert.alert(kind === 'company' ? "Firmalar'a ekle" : 'Fırsat oluştur', kind === 'company' ? companyId ? 'Seçilen firmaya bu yetkili kontak olarak eklenecek.' : `${row.companyName} için yeni firma ve kontak oluşturulacak.` : `${row.companyName} için ${stage.toUpperCase()} aşamasında fırsat oluşturulacak. Aşama şartları eksikse Lead olarak açılır.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Oluştur', onPress: async () => {
        if (completed.current.has(kind) || !guard.begin()) return;
        setBusy(true);
        try {
          if (kind === 'company') {
            await action.mutateAsync({ kind, id: row.id, companyId: companyId ?? undefined, divisionIds: divisionId ? [divisionId] : undefined });
            completed.current.add(kind);
            if (!guard.isCurrent()) return;
            setCompanyDone(true);
            toast.success("Firma ve kontak bağlantısı oluşturuldu");
          } else {
            const result = await action.mutateAsync({ kind, id: row.id, qualificationStage: stage, divisionId: divisionId || undefined });
            completed.current.add(kind);
            if (!guard.isCurrent()) return;
            setOpportunityDone(true);
            if ('blockers' in result && result.blockers.length) toast.error(`Fırsat Lead olarak açıldı: ${result.blockers.join(' · ')}`);
            else toast.success('Fırsat oluşturuldu');
          }
        } catch (error) { if (guard.isCurrent()) toast.error(error instanceof Error ? error.message : 'İşlem tamamlanamadı'); }
        finally { guard.finish(); if (guard.isCurrent()) setBusy(false); }
      } },
    ]);
  };

  return <ModalForm title="Fuar Takibi" submitLabel="Kaydet" onSubmit={() => void submit()} loading={busy} disabled={!canUpdate}>
    <Text className="font-inter text-sm text-muted-foreground">{row.companyName} · {row.contactName}</Text>
    <View pointerEvents={!canUpdate || busy ? 'none' : 'auto'}>
      <CheckRow label="Arandı" value={form.called} onChange={(called) => setForm((f) => ({ ...f, called }))} />
      {row.calledAt ? <Text className="text-xs text-muted-foreground">{row.calledByName ?? 'Kullanıcı'} · {new Date(row.calledAt).toLocaleString('tr-TR')}</Text> : null}
      <CheckRow label="Teklif verildi" value={form.quoted} onChange={(quoted) => setForm((f) => ({ ...f, quoted }))} />
      {row.quotedAt ? <Text className="text-xs text-muted-foreground">{row.quotedByName ?? 'Kullanıcı'} · {new Date(row.quotedAt).toLocaleString('tr-TR')}</Text> : null}
    </View>
    <Text className="text-xs text-muted-foreground">Bu işaretler CRM kaydı oluşturmaz. Firma ve fırsat işlemleri aşağıda ayrıca onaylanır.</Text>
    {canUpdate && (!row.companyId || !row.opportunityId) ? <View pointerEvents={busy ? 'none' : 'auto'}>
      <ChoiceChips label="CRM işleminin bölümü" value={divisionId} onChange={setDivisionId} options={(divisions.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
      {divisions.isPending ? <Text className="text-xs text-muted-foreground">Bölümler yükleniyor…</Text> : null}
      {divisions.error ? <Pressable accessibilityRole="button" onPress={() => void divisions.refetch()}><Text className="text-sm text-destructive">Bölümler yüklenemedi. Yeniden dene</Text></Pressable> : null}
    </View> : null}
    {row.companyId && row.contactId || companyDone ? <Text className="text-sm text-foreground">Firmalar'a eklendi{row.linkedCompanyName ? `: ${row.linkedCompanyName}` : ''}</Text> : canUpdate && canCreateContact ? <View className="gap-2">
      {canReadCompany ? <CompanySelect label="Mevcut firmaya ekle (isteğe bağlı)" value={companyName} selectedId={companyId} onSelect={(item) => { setCompanyId(item?.id ?? null); setCompanyName(item?.label ?? ''); }} disabled={busy} /> : null}
      <Pressable accessibilityRole="button" disabled={busy || (!companyId && (!canCreateCompany || !divisionId))} onPress={() => convert('company')} className="min-h-[44px] justify-center rounded-control border border-border px-3"><Text className="font-inter-medium text-sm text-primary">{companyId ? 'Seçili firmaya kontak ekle' : "Yeni firma ve kontak oluştur"}</Text></Pressable>
      {!companyId && !divisionId ? <Text className="text-xs text-muted-foreground">Yeni firma için bölüm seçin.</Text> : null}
      {!companyId && !canCreateCompany ? <Text className="text-xs text-muted-foreground">Kontak eklemek için mevcut bir firma seçin.</Text> : null}
    </View> : null}
    {row.opportunityId || opportunityDone ? <Text className="text-sm text-foreground">Fırsat oluşturuldu</Text> : canUpdate && canCreateOpportunity && canUpdateOpportunity ? <View className="gap-2">
      <View pointerEvents={busy ? 'none' : 'auto'}><ChoiceChips label="Fırsat aşaması" value={stage} onChange={setStage} options={[{ value: 'lead', label: 'Lead' }, { value: 'c', label: 'C' }, { value: 'b', label: 'B' }, { value: 'a', label: 'A' }, { value: 'a_plus', label: 'A+' }]} /></View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => convert('opportunity')} className="min-h-[44px] justify-center rounded-control border border-border px-3"><Text className="font-inter-medium text-sm text-primary">Fırsat oluştur</Text></Pressable>
    </View> : null}
  </ModalForm>;
}
