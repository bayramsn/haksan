import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter, type Href } from 'expo-router';
import { OPPORTUNITY_PAYMENT_METHODS, type OpportunityPaymentMethodCode } from '@haksan/shared';
import type { OpportunityDetail, Task } from '@/src/api/endpoints';
import { useTaskList } from '@/src/api/tasks.hooks';
import { useUpdateOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { formatDate } from '@/src/lib/format';
import { Button, Card, EmptyState, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { SalesSheet } from './Sheet';
import { buildPaymentTermsPatch, type PaymentTermsSnapshot } from './opportunity-payment-terms';

const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'Yapılacak', in_progress: 'Devam ediyor', done: 'Tamamlandı', cancelled: 'İptal edildi',
};

export function OpportunityTasksPanel({ opportunityId }: { opportunityId: string }) {
  const allowed = useCanAccessModule('tasks');
  return allowed ? <LinkedTasks opportunityId={opportunityId} /> : null;
}

function LinkedTasks({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const canCreate = useCan('tasks.create');
  const tasks = useTaskList({ view: 'all', opportunityId });
  const items = tasks.data?.data ?? [];
  const total = tasks.data?.meta.total ?? items.length;
  return (
    <Card className="gap-3">
      <Eyebrow>Takip görevleri{tasks.data ? ` (${total})` : ''}</Eyebrow>
      {tasks.isPending ? <Loading /> : tasks.error ? (
        <ErrorState message="Takip görevleri yüklenemedi." onRetry={() => void tasks.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="checkbox-outline" title="Takip görevi yok" hint="Bu fırsata henüz görev bağlanmamış." />
      ) : items.slice(0, 5).map((task) => (
        <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`${task.title}, ${STATUS_LABELS[task.status]}. Görev detayını aç`}
          onPress={() => router.push(`/modules/tasks/${task.id}` as Href)}
          className="min-h-11 gap-1 border-t border-border py-3 active:opacity-70">
          <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={2}>{task.title}</Text>
          <Text className={`font-inter text-[12px] ${task.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
            {STATUS_LABELS[task.status]} · {task.dueAt ? formatDate(task.dueAt) : 'Tarih belirlenmedi'}{task.overdue ? ' · Gecikti' : ''}
          </Text>
          <Text className="font-inter text-[12px] text-muted-foreground">{task.assignee?.fullName ?? 'Sorumlu atanmadı'}</Text>
        </Pressable>
      ))}
      {total > 5 ? <View className="gap-2">
        <Text className="font-inter text-[12px] text-muted-foreground">{total} görevden ilk 5 gösteriliyor.</Text>
        <Button label="Tüm takip görevlerini aç" variant="ghost"
          onPress={() => router.push({ pathname: '/modules/tasks', params: { opportunityId, view: 'all' } } as unknown as Href)} />
      </View> : null}
      {canCreate ? <Button label="Takip görevi oluştur" variant="ghost" trailingIcon="add"
        onPress={() => router.push({ pathname: '/modal/task', params: { opportunityId } } as unknown as Href)} /> : null}
    </Card>
  );
}

const METHOD_LABELS: Record<OpportunityPaymentMethodCode, string> = {
  undecided: 'Belirlenmedi', cash: 'Peşin', wire_transfer: 'Havale', promissory_note: 'Senet',
  term: 'Vadeli', installment: 'Taksit', leasing: 'Leasing', letter_of_credit: 'Akreditif', cheque: 'Çek',
};
const METHOD_OPTIONS = OPPORTUNITY_PAYMENT_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }));

export function OpportunityPaymentTermsPanel({ opportunity, canEdit }: { opportunity: OpportunityDetail; canEdit: boolean }) {
  const sheet = useRef<BottomSheetModal>(null);
  const update = useUpdateOpportunity();
  const permitted = useCan('opportunities.update');
  const editable = canEdit && permitted;
  const [baseline, setBaseline] = useState<PaymentTermsSnapshot>(opportunity);
  const [method, setMethod] = useState<string | null>(opportunity.paymentMethod);
  const [days, setDays] = useState('');
  const [terms, setTerms] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openEditor() {
    setBaseline({ id: opportunity.id, paymentMethod: opportunity.paymentMethod, paymentTermDays: opportunity.paymentTermDays, paymentTerms: opportunity.paymentTerms });
    setMethod(opportunity.paymentMethod);
    setDays(opportunity.paymentTermDays == null ? '' : String(opportunity.paymentTermDays));
    setTerms(opportunity.paymentTerms ?? '');
    setError(null);
    sheet.current?.present();
  }

  function save() {
    if (!editable || update.isPending) return;
    const result = buildPaymentTermsPatch({ baseline, opportunityId: opportunity.id, method, days, terms });
    if (!result.ok) { setError(result.error); return; }
    const { patch } = result;
    if (!Object.keys(patch).length) { sheet.current?.dismiss(); return; }
    update.mutate({ id: opportunity.id, ...patch }, {
      onSuccess: () => { sheet.current?.dismiss(); toast.success('Ödeme bilgileri güncellendi'); },
      onError: () => toast.error('Ödeme bilgileri kaydedilemedi. Lütfen yeniden deneyin.'),
    });
  }

  const methodLabel = opportunity.paymentMethod ? METHOD_LABELS[opportunity.paymentMethod as OpportunityPaymentMethodCode] ?? opportunity.paymentMethod : 'Belirlenmedi';
  const options = method && !METHOD_OPTIONS.some((option) => option.value === method)
    ? [{ value: method, label: method }, ...METHOD_OPTIONS] : METHOD_OPTIONS;
  return (
    <Card className="gap-3">
      <Eyebrow>Ödeme bilgileri</Eyebrow>
      <InfoRows showEmpty items={[
        { label: 'Ödeme biçimi', value: methodLabel },
        { label: 'Ödeme vadesi', value: opportunity.paymentTermDays == null ? 'Belirlenmedi' : `${opportunity.paymentTermDays} gün` },
        { label: 'Ödeme koşulları', value: opportunity.paymentTerms || 'Belirtilmedi' },
      ]} />
      {editable ? <Button label="Ödeme bilgilerini düzenle" variant="ghost" onPress={openEditor} disabled={update.isPending} /> : null}
      <SalesSheet ref={sheet} title="Ödeme bilgilerini düzenle">
        <OptionPicker label="Ödeme biçimi" value={method} options={options} clearable disabled={update.isPending} onChange={setMethod} />
        <Field label="Ödeme vadesi (gün)" value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={4} editable={!update.isPending} placeholder="Belirlenmedi" />
        <Field label="Ödeme koşulları" value={terms} onChangeText={setTerms} multiline numberOfLines={4} maxLength={4000} editable={!update.isPending} />
        {error ? <Text accessibilityRole="alert" className="font-inter text-[13px] text-destructive">{error}</Text> : null}
        <Button label="Kaydet" onPress={save} loading={update.isPending} disabled={!editable || update.isPending} />
        <Button label="Vazgeç" variant="ghost" onPress={() => sheet.current?.dismiss()} disabled={update.isPending} />
      </SalesSheet>
    </Card>
  );
}
