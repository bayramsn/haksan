import { useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tradeFairFollowUpSchema } from '@haksan/shared';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import type { TradeFairFollowUp } from '@/src/api/trade-fairs.api';
import { useCachedTradeFair, useUpdateTradeFair } from '@/src/api/trade-fairs.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, Field } from '@/src/ui';
import { ChoiceChips, ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { CONTACT_METHODS, emptyFollowUp, followUpDraft } from '@/src/ui/trade-fairs/tradeFairLogic';

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
  const params = useLocalSearchParams<{ id?: string; mark?: string }>();
  const { user } = useAuth();
  const isManager = Boolean(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
  const canUpdate = useCan('trade_fairs.update') || isManager;
  const row = useCachedTradeFair(params.id);
  const [form, setForm] = useState<TradeFairFollowUp>(() => (row ? followUpDraft(row, params.mark !== '0') : emptyFollowUp()));
  const [submitted, setSubmitted] = useState(false);
  const update = useUpdateTradeFair();

  const parsed = tradeFairFollowUpSchema.safeParse(form);
  const errors = useMemo(() => {
    const out: Partial<Record<string, string>> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) out[String(issue.path[0])] ??= issue.message;
    return out;
  }, [parsed]);
  const err = (key: string) => (submitted ? errors[key] : undefined);
  const star = form.contacted ? ' *' : '';

  if (!row) {
    return (
      <ModalForm title="Görüşme Takibi" submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Kayıt bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    setSubmitted(true);
    if (!canUpdate) return;
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Görüşme kaydedilemedi');
      return;
    }
    update.mutate(
      { id: row.id, body: parsed.data as Partial<TradeFairFollowUp> },
      {
        onSuccess: () => {
          toast.success('Görüşme takibi kaydedildi');
          router.back();
        },
        onError: (error) => toast.error(error.message || 'Görüşme kaydedilemedi'),
      },
    );
  };

  return (
    <ModalForm title="Görüşme Takibi" submitLabel="Kaydet" onSubmit={submit} loading={update.isPending} disabled={!canUpdate}>
      <Text className="font-inter text-sm text-muted-foreground">{row.companyName} · {row.contactName}</Text>
      <CheckRow label="Görüşüldü" value={form.contacted} onChange={(contacted) => setForm((f) => ({ ...f, contacted }))} />
      <ChoiceChips
        label={`Görüşme yolu${star}`}
        options={CONTACT_METHODS}
        value={form.contactMethod}
        onChange={(contactMethod) => setForm((f) => ({ ...f, contactMethod }))}
      />
      {err('contactMethod') ? <Text className="font-inter text-xs text-destructive">{err('contactMethod')}</Text> : null}
      <Field
        label={`Görüşme tarihi${star}`}
        value={form.contactDate ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, contactDate: v || null }))}
        placeholder="YYYY-AA-GG"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        error={err('contactDate')}
      />
      <Field
        label={`Görüşme notu${star}`}
        value={form.contactNotes ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, contactNotes: v }))}
        maxLength={4000}
        multiline
        numberOfLines={4}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
        error={err('contactNotes')}
      />
      <CheckRow label="Fuar teklifi iletildi" value={form.offerSent} onChange={(offerSent) => setForm((f) => ({ ...f, offerSent }))} />
      <CheckRow label="Müşteriye dönüştü" value={form.customerConverted} onChange={(customerConverted) => setForm((f) => ({ ...f, customerConverted }))} />
    </ModalForm>
  );
}
