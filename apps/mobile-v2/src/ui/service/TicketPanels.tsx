import { syncServiceTimerActivity } from '@/src/native/live-activity';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerDevice, ProductModel, ServiceTicket } from '@/src/api/endpoints';
import { useServiceTickets } from '@/src/api/operations.hooks';
import { useConsumeServiceParts, useUpdateTicketMeta } from '@/src/api/service.hooks';
import type { TicketUpdateBody } from '@/src/api/service.api';
import { useAuth } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, FormSection, MetaCell, ProductPicker } from './fields';
import { CURRENCIES, joinedNotes, type Currency } from './serviceForms';
import {
  STAGE_LABELS,
  TICKET_TYPE_LABELS,
  elapsedSeconds,
  formatElapsed,
  historyTimestamp,
  isPartOperation,
  makeHistoryItem,
  operationsTotal,
  readHistory,
  readOperations,
  readTimer,
  serviceFee,
  serviceStageOf,
  timerPatch,
  type HistoryItem,
} from './serviceStage';

type Directory = { id: string; fullName: string }[] | undefined;

/** Web `withActivity`: her yazımda aktivite geçmişine satır ekler. */
export function useTicketWriter(ticket: ServiceTicket) {
  const update = useUpdateTicketMeta(ticket.id);
  const { user } = useAuth();
  const write = (activity: string, metadata: Record<string, unknown>, extra: Omit<TicketUpdateBody, 'metadata'> = {}) => {
    const activityHistory = [...readHistory(ticket.metadata, 'activityHistory'), makeHistoryItem('srv-act', activity, new Date(), user?.id)];
    return update.mutateAsync({ ...extra, metadata: { ...metadata, activityHistory } });
  };
  return { write, busy: update.isPending, userId: user?.id };
}

function actorName(directory: Directory, meId: string | undefined, meName: string | undefined, id?: string) {
  if (!id) return null;
  if (id === meId) return meName ?? null;
  return directory?.find((user) => user.id === id)?.fullName ?? null;
}

function HistoryCard({ item, actor, children }: { item: HistoryItem; actor: string | null; children?: React.ReactNode }) {
  return (
    <View className="gap-1 border-b border-border py-2.5">
      <Text className="font-inter text-sm leading-5 text-foreground">{item.text}</Text>
      <Text className="font-inter text-[11px] text-muted-foreground">
        {[actor ?? 'Bilinmeyen kullanıcı', item.createdAt].filter(Boolean).join(' · ')}
      </Text>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------- sayaç ---- */

export function TimerCard({ ticket, canUpdate }: { ticket: ServiceTicket; canUpdate: boolean }) {
  const { colors } = useTheme();
  const { write, busy } = useTicketWriter(ticket);
  const timer = readTimer(ticket.metadata);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer.status]);

  // Sayaç çalışırken/beklemedeyken Dynamic Island ve kilit ekranında görünür; durunca kapanır.
  const companyName = ticket.company?.shortName ?? ticket.company?.legalTitle ?? null;
  useEffect(() => {
    syncServiceTimerActivity({ id: ticket.id, ticketNo: ticket.ticketNo, companyName }, timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız sayaç değişince
  }, [ticket.id, ticket.ticketNo, companyName, timer.status, timer.startedAt, timer.elapsedSeconds]);

  const run = (action: 'start' | 'pause' | 'stop') => {
    const label = action === 'start' ? 'Sayaç başlatıldı.' : action === 'pause' ? 'Sayaç beklemeye alındı.' : 'Sayaç durduruldu.';
    write(label, timerPatch(action, timer, new Date()))
      .then(() => toast.success(label.replace('.', '')))
      .catch((error: Error) => toast.error(error.message));
  };

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="stopwatch-outline" size={18} color={colors.primary} />
          <Text className="font-display-semibold text-[16px] text-foreground">Saha Sayacı</Text>
        </View>
        <Chip
          tone={timer.status === 'running' ? 'success' : timer.status === 'paused' ? 'warning' : 'neutral'}
          label={timer.status === 'running' ? 'Çalışıyor' : timer.status === 'paused' ? 'Beklemede' : timer.status === 'stopped' ? 'Durduruldu' : 'Başlamadı'}
        />
      </View>
      <Text accessibilityLabel={`Geçen süre ${formatElapsed(elapsedSeconds(timer, now))}`} className="font-display text-[34px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
        {formatElapsed(elapsedSeconds(timer, now))}
      </Text>
      {canUpdate ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" label="Başlat" disabled={busy || timer.status === 'running'} onPress={() => run('start')} />
          <Button className="flex-1" label="Duraklat" variant="ghost" disabled={busy || timer.status !== 'running'} onPress={() => run('pause')} />
          <Button className="flex-1" label="Durdur" variant="ghost" disabled={busy || timer.status === 'idle' || timer.status === 'stopped'} onPress={() => run('stop')} />
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------- not geçmişi ---- */

export function NotesPanel({ ticket, canUpdate, directory }: { ticket: ServiceTicket; canUpdate: boolean; directory: Directory }) {
  const { write, busy, userId } = useTicketWriter(ticket);
  const { user } = useAuth();
  const notes = readHistory(ticket.metadata, 'noteHistory');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const save = (activity: string, next: HistoryItem[], onDone?: () => void) =>
    write(activity, { noteHistory: next }, { resolutionNote: joinedNotes(next) })
      .then(() => {
        toast.success(activity.replace('.', ''));
        onDone?.();
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <FormSection title="Not Geçmişi">
      {canUpdate ? (
        <View className="gap-2">
          <Field label="Servis notu" value={draft} onChangeText={setDraft} multiline placeholder="Servis notu" style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
          <Button
            label="Ekle"
            disabled={busy || !draft.trim()}
            onPress={() => save('Not eklendi.', [...notes, makeHistoryItem('srv-note', draft.trim(), new Date(), userId)], () => setDraft(''))}
          />
        </View>
      ) : null}
      {notes.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Not kaydı yok.</Text> : null}
      {notes.map((item) =>
        editingId === item.id ? (
          <View key={item.id} className="gap-2 border-b border-border py-2.5">
            <Field label="Notu düzenle" value={editingText} onChangeText={setEditingText} multiline style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
            <View className="flex-row gap-2">
              <Button className="flex-1" label="İptal" variant="ghost" onPress={() => setEditingId(null)} />
              <Button
                className="flex-1"
                label="Kaydet"
                disabled={busy || !editingText.trim()}
                onPress={() =>
                  save(
                    'Not düzenlendi.',
                    notes.map((note) => (note.id === item.id ? { ...note, text: editingText.trim(), byUserId: userId } : note)),
                    () => setEditingId(null),
                  )
                }
              />
            </View>
          </View>
        ) : (
          <HistoryCard key={item.id} item={item} actor={actorName(directory, user?.id, user?.fullName, item.byUserId)}>
            {canUpdate ? (
              <View className="flex-row justify-end gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Notu düzenle"
                  onPress={() => {
                    setEditingId(item.id);
                    setEditingText(item.text);
                  }}
                  className="min-h-[44px] justify-center px-3 active:opacity-60"
                >
                  <Text className="font-inter-semibold text-[13px] text-primary">Düzenle</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Notu sil"
                  onPress={() =>
                    Alert.alert('Notu sil', 'Bu not kalıcı olarak silinecek.', [
                      { text: 'Vazgeç', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => void save('Not silindi.', notes.filter((note) => note.id !== item.id)) },
                    ])
                  }
                  className="min-h-[44px] justify-center px-3 active:opacity-60"
                >
                  <Text className="font-inter-semibold text-[13px] text-destructive">Sil</Text>
                </Pressable>
              </View>
            ) : null}
          </HistoryCard>
        ),
      )}
    </FormSection>
  );
}

/* --------------------------------------------------- müşteri iletişim ---- */

export function CommunicationPanel({ ticket, canUpdate, directory }: { ticket: ServiceTicket; canUpdate: boolean; directory: Directory }) {
  const { write, busy, userId } = useTicketWriter(ticket);
  const { user } = useAuth();
  const complaints = readHistory(ticket.metadata, 'complaints');
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    write(
      'Şikayet kaydı eklendi.',
      { complaints: [...complaints, makeHistoryItem('srv-complaint', text, new Date(), userId)] },
      { description: [ticket.description?.trim(), text].filter(Boolean).join('\n\n').slice(0, 4000) },
    )
      .then(() => {
        setDraft('');
        toast.success('Şikayet kaydı eklendi');
      })
      .catch((error: Error) => toast.error(error.message));
  };
  return (
    <FormSection title="Şikayetler">
      {ticket.sourceComplaint ? (
        <View className="gap-1 rounded-control bg-muted px-3 py-2">
          <Text className="font-inter-semibold text-[13px] text-foreground">Kaynak şikayet {ticket.sourceComplaint.complaintNo}</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            {[ticket.sourceComplaint.contactName, ticket.sourceComplaint.contactPhone, ticket.sourceComplaint.contactEmail].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}
          </Text>
        </View>
      ) : null}
      {canUpdate ? (
        <View className="gap-2">
          <Field label="Şikayet / müşteri iletişim notu" value={draft} onChangeText={setDraft} multiline style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
          <Button label="Ekle" disabled={busy || !draft.trim()} onPress={add} />
        </View>
      ) : null}
      {complaints.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Şikayet kaydı yok.</Text> : null}
      {complaints.map((item) => (
        <HistoryCard key={item.id} item={item} actor={actorName(directory, user?.id, user?.fullName, item.byUserId)} />
      ))}
    </FormSection>
  );
}

/* --------------------------------------------------- aktivite geçmişi ---- */

export function ActivityPanel({ ticket, directory }: { ticket: ServiceTicket; directory: Directory }) {
  const { user } = useAuth();
  const items = readHistory(ticket.metadata, 'activityHistory');
  return (
    <FormSection title="Aktivite Geçmişi">
      {items.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Aktivite kaydı yok.</Text> : null}
      {[...items].reverse().map((item) => (
        <HistoryCard key={item.id} item={item} actor={actorName(directory, user?.id, user?.fullName, item.byUserId)} />
      ))}
    </FormSection>
  );
}

/* ---------------------------------------------- ücret / işlem / parça ---- */

export function FeePanel({ ticket, canUpdate, canConsume, directory }: { ticket: ServiceTicket; canUpdate: boolean; canConsume: boolean; directory: Directory }) {
  const { write, busy, userId } = useTicketWriter(ticket);
  const { user } = useAuth();
  const consume = useConsumeServiceParts(ticket.id);
  const metadata = ticket.metadata;
  const operations = readOperations(metadata);
  const timer = readTimer(metadata);
  const currency: Currency = CURRENCIES.includes(metadata?.serviceCurrency as Currency) ? (metadata!.serviceCurrency as Currency) : 'USD';
  const savedRate = Number(metadata?.serviceHourlyRate ?? 120) || 0;
  const [rate, setRate] = useState(String(savedRate));
  const elapsed = elapsedSeconds(timer, Date.now());
  const fee = serviceFee(elapsed, savedRate);
  const manualTotal = operationsTotal(operations, currency);

  const [labor, setLabor] = useState<ProductModel | null>(null);
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('0');
  const [opCurrency, setOpCurrency] = useState<Currency>(currency);

  const [part, setPart] = useState<ProductModel | null>(null);
  const [partQty, setPartQty] = useState('1');
  const [partNote, setPartNote] = useState('');

  useEffect(() => setRate(String(savedRate)), [savedRate]);

  const fail = (error: Error) => toast.error(error.message);

  const addOperation = () => {
    const text = description.trim();
    if (!text) return;
    const next = [
      ...operations,
      {
        id: `srv-op-${Date.now()}`,
        description: text,
        quantity: Math.max(1, Number(qty) || 1),
        unitPrice: Math.max(0, Number(price.replace(',', '.')) || 0),
        currency: opCurrency,
        kind: 'labor' as const,
        createdAt: historyTimestamp(new Date()),
        byUserId: userId,
      },
    ];
    write('Manuel servis işlemi eklendi.', { operations: next })
      .then(() => {
        setLabor(null);
        setDescription('');
        setQty('1');
        setPrice('0');
        toast.success('İşlem eklendi');
      })
      .catch(fail);
  };

  const consumePart = async () => {
    if (!part) return;
    const quantity = Math.max(1, Number(partQty) || 1);
    try {
      await consume.mutateAsync({ companyId: ticket.companyId, lines: [{ productModelId: part.id, quantity, notes: partNote.trim() || undefined }] });
      const label = part.modelName ?? part.modelCode ?? part.fullName;
      await write(`Stoktan parça düşüldü: ${label} × ${quantity}.`, {
        operations: [
          ...operations,
          {
            id: `srv-part-${Date.now()}`,
            description: `Parça kullanımı: ${label}${part.stockCode ? ` (${part.stockCode})` : ''}`,
            quantity,
            unitPrice: 0,
            currency,
            kind: 'part',
            createdAt: historyTimestamp(new Date()),
            byUserId: userId,
          },
        ],
      });
      toast.success('Parça stoğu düşüldü');
      setPart(null);
      setPartQty('1');
      setPartNote('');
    } catch (error) {
      fail(error as Error);
    }
  };

  return (
    <>
      <FormSection title="Servis Ücreti">
        <View className="flex-row flex-wrap gap-2">
          <MetaCell label="Geçirilen Süre" value={formatElapsed(elapsed)} />
          <MetaCell label="Servis Ücreti Kalemi" value={formatAmount(fee, currency)} />
        </View>
        {canUpdate ? (
          <>
            <Field
              label="Saatlik Ücret"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              onEndEditing={() => {
                const next = Math.max(0, Number(rate.replace(',', '.')) || 0);
                if (next === savedRate) return;
                write('Saatlik servis ücreti güncellendi.', { serviceHourlyRate: next })
                  .then(() => toast.success('Saatlik ücret kaydedildi'))
                  .catch(fail);
              }}
            />
            <ChoiceChips
              label="Para Birimi"
              value={currency}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
              onChange={(next) =>
                write('Servis para birimi güncellendi.', { serviceCurrency: next })
                  .then(() => toast.success('Para birimi kaydedildi'))
                  .catch(fail)
              }
            />
          </>
        ) : null}
      </FormSection>

      <FormSection title="Manuel İşlemler">
        {canUpdate ? (
          <View className="gap-2">
            <ProductPicker
              label="İşçilik Kalemi"
              placeholder="Katalogdan seçin (isteğe bağlı)"
              value={labor ? { id: labor.id, name: labor.modelName ?? labor.modelCode ?? labor.fullName } : null}
              categoryCodes={['ISCILIK']}
              onChange={(next) => {
                setLabor(next);
                if (!next) return;
                setDescription(next.modelName ?? next.modelCode ?? next.fullName);
                const unitPrice = Number(next.cashPrice ?? next.listPrice ?? 0) || 0;
                if (unitPrice) setPrice(String(unitPrice));
                const code = next.currency?.code as Currency | undefined;
                if (code && CURRENCIES.includes(code)) setOpCurrency(code);
              }}
            />
            <Field label="İşlem" value={description} onChangeText={setDescription} placeholder="Yapılan işlem" />
            <View className="flex-row gap-2">
              <View className="flex-1"><Field label="Adet" value={qty} onChangeText={setQty} keyboardType="number-pad" /></View>
              <View className="flex-1"><Field label="Birim" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View>
            </View>
            <ChoiceChips label="Para" value={opCurrency} options={CURRENCIES.map((code) => ({ value: code, label: code }))} onChange={setOpCurrency} />
            <Button label="Ekle" disabled={busy || !description.trim()} onPress={addOperation} />
          </View>
        ) : null}
        {operations.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Manuel işlem yok.</Text> : null}
        {operations.map((op) => (
          <View key={op.id} className="gap-0.5 border-b border-border py-2.5">
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 font-inter-medium text-[14px] text-foreground">{op.description}</Text>
              <Text className="font-inter-semibold text-[13px] text-foreground">{formatAmount(op.quantity * op.unitPrice, op.currency)}</Text>
            </View>
            <Text className="font-inter text-[11px] text-muted-foreground">
              {[
                actorName(directory, user?.id, user?.fullName, op.byUserId ?? ticket.assignedToUserId ?? undefined) ?? 'Bilinmeyen kullanıcı',
                op.createdAt,
                `${op.quantity} × ${formatAmount(op.unitPrice, op.currency)}`,
                isPartOperation(op) ? 'Parça' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ))}
        <View className="flex-row items-center justify-between rounded-control bg-muted px-3 py-2.5">
          <Text className="flex-1 font-inter text-[13px] text-foreground">Servis ücreti + aynı para birimindeki manuel işlemler</Text>
          <Text className="font-inter-bold text-[14px] text-foreground">{formatAmount(fee + manualTotal, currency)}</Text>
        </View>
      </FormSection>

      {canConsume ? (
        <FormSection title="Yedek Parça / Aksesuar Kullanımı">
          <ProductPicker
            label="Ürün"
            value={part ? { id: part.id, name: [part.modelName ?? part.fullName, part.stockCode].filter(Boolean).join(' · ') } : null}
            categoryCodes={['YEDEK_PARCA', 'AKSESUAR']}
            placeholder="Parça seçin"
            onChange={setPart}
          />
          <View className="flex-row gap-2">
            <View className="w-24"><Field label="Adet" value={partQty} onChangeText={setPartQty} keyboardType="number-pad" /></View>
            <View className="flex-1"><Field label="Not" value={partNote} onChangeText={setPartNote} placeholder="Opsiyonel" /></View>
          </View>
          <Button label="Stoktan düş" disabled={!part || consume.isPending || busy} loading={consume.isPending} onPress={() => void consumePart()} />
        </FormSection>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------- makine dosyası ---- */

export function MachineFilePanel({
  ticket,
  device,
  companyInfo,
}: {
  ticket: ServiceTicket;
  device: CustomerDevice | null;
  companyInfo: { label: string; value: string | null }[];
}) {
  const router = useRouter();

  return (
    <>
      <FormSection title="Makine Kimliği">
        {device ? (
          <View className="flex-row flex-wrap gap-2">
            <MetaCell label="Marka" value={device.brandName} />
            <MetaCell label="Model" value={device.productModelName ?? device.model} />
            <MetaCell label="Tip" value={device.productTypeName} />
            <MetaCell label="Seri No" value={device.serialNumber} />
            <MetaCell label="Kontrol Ünitesi" value={device.controlUnit} />
            <MetaCell label="Kontrol Ünitesi Seri No" value={device.controlUnitSerialNumber ?? null} />
            <MetaCell label="Kurulum" value={device.installationDate ? formatDate(device.installationDate) : null} />
            <MetaCell label="Garanti" value={[device.warrantyStartDate, device.warrantyEndDate].map((d) => (d ? formatDate(d) : '—')).join(' / ')} />
          </View>
        ) : (
          <Text className="font-inter text-sm text-muted-foreground">Bu servis kaydı henüz bir makineyle eşleşmemiş.</Text>
        )}
        {device ? (
          <Button label="Makine Kartı" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.push(`/modules/customer-devices/${device.id}`)} />
        ) : null}
      </FormSection>

      <FormSection title="Müşteri Bilgisi">
        <MetaCell label="Firma" value={ticket.company?.legalTitle} />
        <View className="flex-row flex-wrap gap-2">
          {companyInfo.map((item) => (
            <MetaCell key={item.label} label={item.label} value={item.value} />
          ))}
        </View>
      </FormSection>

      {device ? (
        <DeviceServiceHistory deviceId={device.id} companyName={ticket.company?.legalTitle ?? ''} excludeTicketId={ticket.id} />
      ) : null}
    </>
  );
}

/**
 * Makinenin servis kayıtları. Talep ucu makine filtresi sunmadığı için firma
 * aramasının sonuçları istemcide makineye göre süzülür.
 */
export function DeviceServiceHistory({
  deviceId,
  companyName,
  excludeTicketId,
  title = 'Makine Servis Geçmişi',
}: {
  deviceId: string;
  companyName: string;
  excludeTicketId?: string;
  title?: string;
}) {
  const router = useRouter();
  const related = useServiceTickets({ search: companyName.slice(0, 128) }, Boolean(deviceId && companyName));
  const machineTickets = useMemo(
    () =>
      (related.data?.items ?? [])
        .filter((item) => item.customerDeviceId === deviceId && item.id !== excludeTicketId)
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    [deviceId, excludeTicketId, related.data?.items],
  );
  const openCount = machineTickets.filter((item) => serviceStageOf(item) !== 'Closed').length;

  return (
    <FormSection title={title} hint={`${related.hasNextPage ? 'Yüklenen kayıtlarda: ' : ''}${machineTickets.length} geçmiş kayıt · ${openCount} açık`}>
      {related.isLoading ? <Loading /> : null}
      {related.error ? (
        <ErrorState message="Makinenin servis geçmişi yüklenemedi." onRetry={() => {
          if (related.isFetchNextPageError) void related.fetchNextPage();
          else void related.refetch();
        }} />
      ) : !related.isLoading && machineTickets.length === 0 ? (
        <Text className="font-inter text-sm text-muted-foreground">{related.hasNextPage ? 'Yüklenen kayıtlarda bu makineye ait servis bulunamadı. Diğer kayıtları yükleyebilirsiniz.' : 'Bu makine için önceki servis kaydı yok.'}</Text>
      ) : null}
      {machineTickets.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${item.ticketNo} servis kaydını aç`}
          onPress={() => router.push(`/modules/service-tickets/${item.id}`)}
          className="min-h-[56px] justify-center gap-0.5 border-b border-border py-2 active:opacity-60"
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>{item.subject}</Text>
            <Chip tone="neutral" label={STAGE_LABELS[serviceStageOf(item)]} />
          </View>
          <Text className="font-inter text-xs text-muted-foreground">
            {[item.ticketNo, TICKET_TYPE_LABELS[item.ticketType] ?? item.ticketType, formatDate(item.reportedAt)].join(' · ')}
          </Text>
        </Pressable>
      ))}
      {related.hasNextPage ? (
        <Button label="Daha fazla yükle" variant="ghost" loading={related.isFetchingNextPage} disabled={related.isFetchingNextPage} onPress={() => void related.fetchNextPage()} />
      ) : null}
    </FormSection>
  );
}

export function TabLocked({ hint }: { hint: string }) {
  return <EmptyState title="Bu sekme henüz açılmadı" hint={hint} icon="lock-closed-outline" />;
}
