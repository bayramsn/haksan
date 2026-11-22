import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceTicket } from '@/src/api/endpoints';
import { TICKET_PHASE_META, ticketPhase, useForwardToSales, useServiceTicket, useServiceTicketSummary, useServiceTickets } from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, Eyebrow, Field, ListRow } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/** Web OpportunityWorkspace `isOpenService`: tamamlandı/imzalı form/kapandı dışı. */
export const isOpenTicket = (ticket: ServiceTicket) => ticketPhase(ticket) !== 'done';

/** Firmanın açık/toplam servis sayısı; liste sayfalarına değil sunucu özetine dayanır. */
export function useCompanyServiceSummary(companyId: string | null | undefined) {
  const canRead = useCan('service_tickets.read');
  const summary = useServiceTicketSummary({ companyId: companyId ?? undefined }, canRead && Boolean(companyId));
  return { canRead, summary: summary.data };
}

/** Firmanın servis kayıtları (sunucu `companyId` süzgeci); izin yoksa hiç istenmez. */
export function useCompanyServiceTickets(companyId: string | null | undefined, enabled = true) {
  const canRead = useCan('service_tickets.read');
  const list = useServiceTickets({ companyId: companyId ?? undefined }, canRead && Boolean(companyId) && enabled);
  return { canRead, list, tickets: list.data?.items ?? [] };
}

export function ServiceTicketRow({ ticket, note }: { ticket: ServiceTicket; note?: string }) {
  const router = useRouter();
  const phase = TICKET_PHASE_META[ticketPhase(ticket)];
  return (
    <ListRow
      title={`${ticket.ticketNo} · ${ticket.subject}`}
      lines={[note, formatDate(ticket.reportedAt)]}
      icon="construct-outline"
      chip={{ label: phase.label, tone: phase.tone }}
      onPress={() => router.push(`/modules/service-tickets/${ticket.id}` as Href)}
    />
  );
}

/** Servis detayı: makinenin satışı, iletilen lead ve "Satışa ilet". */
export function TicketSalesSection({ ticket, canUpdate }: { ticket: ServiceTicket; canUpdate: boolean }) {
  const router = useRouter();
  const canReadSales = useCan('opportunities.read');
  const forward = useForwardToSales(ticket.id);
  const [need, setNeed] = useState('');
  const [open, setOpen] = useState(false);
  const sale = ticket.salesOpportunity ?? null;
  const leadId = ticket.forwardedLeadId ?? null;
  if (!sale && !leadId && !canUpdate) return null;

  const submit = () => {
    const text = need.trim();
    if (text.length < 3) return toast.error('Müşterinin ihtiyacını kısaca yazın.');
    forward.mutate(text, {
      onSuccess: () => {
        toast.success('Satışa iletildi; lead satış ekibine düştü.');
        setNeed('');
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <Card className="gap-3">
      <Eyebrow>Satış</Eyebrow>
      <Text className="font-inter text-[12px] text-muted-foreground">Servis ayrı çalışır; satış fırsatı görülürse lead olarak iletilir.</Text>
      {sale ? (
        <View className="gap-2">
          <Text className="font-inter text-[11px] uppercase tracking-wide text-muted-foreground">Makinenin satışı</Text>
          <Text className="font-inter-medium text-sm text-foreground">{sale.title ?? 'Satış kaydı'}</Text>
          {canReadSales ? (
            <Button label="Satışı aç" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.push(`/modules/opportunities/${sale.id}` as Href)} />
          ) : null}
        </View>
      ) : null}
      {leadId ? (
        <View className="gap-2">
          <View className="flex-row">
            <Chip tone="success" label="Satışa iletildi" />
          </View>
          {canReadSales ? (
            <Button label="Lead'i aç" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.push(`/modules/opportunities/${leadId}` as Href)} />
          ) : null}
        </View>
      ) : canUpdate ? (
        open ? (
          <View className="gap-2">
            <Field
              label="Müşterinin ihtiyacı"
              value={need}
              onChangeText={setNeed}
              multiline
              maxLength={2000}
              placeholder="Örn. ikinci tezgah istiyor, yedek parça teklifi bekliyor"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button label="Vazgeç" variant="ghost" disabled={forward.isPending} onPress={() => setOpen(false)} />
              </View>
              <View className="flex-1">
                <Button label="Lead aç" loading={forward.isPending} disabled={forward.isPending} onPress={submit} />
              </View>
            </View>
          </View>
        ) : (
          <Button label="Satışa ilet" variant="ghost" trailingIcon="briefcase-outline" onPress={() => setOpen(true)} />
        )
      ) : null}
    </Card>
  );
}

/** Fırsat: kaynak servis, bu satışın makinesindeki servisler, firmanın açık servisleri. */
export function OpportunityServicePanel({
  opportunityId,
  companyId,
  sourceServiceTicketId,
}: {
  opportunityId: string;
  companyId: string | null;
  sourceServiceTicketId?: string | null;
}) {
  // Satışın makinesi ve kaynak kayıt ayrı sorgularla gelir; firma listesinin ilk sayfasına sığmasa da görünür.
  const { canRead, tickets: companyTickets } = useCompanyServiceTickets(companyId);
  const sale = useServiceTickets({ opportunityId }, canRead);
  const source = useServiceTicket(canRead && sourceServiceTicketId ? sourceServiceTicketId : '');
  const candidates = [source.data, ...(sale.data?.items ?? []), ...companyTickets.filter(isOpenTicket)];
  const related = [...new Map(candidates.filter((t): t is ServiceTicket => Boolean(t)).map((t) => [t.id, t])).values()];
  if (!canRead || related.length === 0) return null;
  const note = (ticket: ServiceTicket) =>
    ticket.id === sourceServiceTicketId ? 'Bu lead buradan geldi' : ticket.opportunityId === opportunityId ? 'Bu satışın makinesi' : 'Firmanın açık servisi';
  return (
    <Card className="gap-2">
      <Eyebrow>Servis</Eyebrow>
      {related.slice(0, 6).map((ticket) => <ServiceTicketRow key={ticket.id} ticket={ticket} note={note(ticket)} />)}
    </Card>
  );
}

/** Fırsat başlığı altında: firmada açık servis varsa satışçı görüşmeden önce bilsin. */
export function OpenServiceWarning({ companyId, onPress }: { companyId: string | null; onPress?: () => void }) {
  const { colors } = useTheme();
  const { canRead, summary } = useCompanyServiceSummary(companyId);
  const count = summary?.open ?? 0;
  if (!canRead || count === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Firmanın ${count} açık servis kaydı var`}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-2 rounded-control border border-warning-border bg-warning-soft px-3 py-2 active:opacity-70"
    >
      <Ionicons name="warning-outline" size={18} color={colors.warning} />
      <Text className="flex-1 font-inter-medium text-[13px] text-warning">Firmanın {count} açık servis kaydı var</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.warning} /> : null}
    </Pressable>
  );
}
