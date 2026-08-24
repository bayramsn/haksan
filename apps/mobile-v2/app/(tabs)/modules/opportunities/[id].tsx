import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useActivityList,
  useCloseOpportunity,
  useDecideOpportunityApproval,
  useOpportunity,
  useOpportunityAssignees,
  useReopenOpportunity,
  useSetProcessCheck,
  useSetQualificationStage,
  useUpdateOpportunity,
} from '@/src/api/crm.hooks';
import {
  OPPORTUNITY_APPROVAL_TYPES,
  QUALIFICATION_STAGES,
  opportunityApprovalTypeLabels,
  qualificationStageLabels,
  type OpportunityApprovalType,
  type QualificationStage,
} from '@/src/api/endpoints';
import { formatAmount, formatDate, formatDateTime, parseLocalDateTime } from '@/src/lib/format';
import { toast } from '@/src/ui/toast';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, ListRow, Loading } from '@/src/ui';
import { InfoRows, ProgressBar, StatCard, StatGrid } from '@/src/ui/data';
import { useCan } from '@/src/auth/AuthProvider';

const STAGE_TONE: Record<QualificationStage, Tone> = {
  lead: 'neutral',
  c: 'info',
  b: 'stage',
  a: 'warning',
  a_plus: 'warning',
  win: 'success',
  lost: 'destructive',
};

/**
 * Kayıp nedeni sabit listesi — web LostCaseDialog ile aynı kodlar (seed
 * cancellation_reasons). Sunucu kodu bulamazsa otomatik oluşturur.
 */
const LOST_REASONS: { code: string; name: string }[] = [
  { code: 'price', name: 'Fiyat / Bütçe Yetersiz' },
  { code: 'competitor', name: 'Rakip Tercih Edildi' },
  { code: 'timing', name: 'Zamanlama / Yatırım Ertelendi' },
  { code: 'spec', name: 'Teknik Şartname Karşılanamadı' },
  { code: 'no_budget', name: 'Bütçe Onayı Çıkmadı' },
  { code: 'other', name: 'Diğer' },
];

/**
 * 8'li modül ızgarası: sunucuda modül başına gerçek SAYI (kaç teklif/sevkiyat...)
 * döndüren bir uç yok — yalnızca `processReadiness.checks` üzerinden var/yok
 * kanıtı var (opportunities.service.ts `processEvidence`). Bu yüzden rozetler
 * sayı değil "Var/Yok"; Aktiviteler tek gerçek sayaçtır (activities.list total).
 * "Notlar" için ayrı bir sayaç/uç yok — [VERİ YOK], kutu konmadı.
 */
const MODULE_TILES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'quote', label: 'Teklifler', icon: 'document-text-outline' },
  { key: 'proforma', label: 'Proforma', icon: 'receipt-outline' },
  { key: 'stock', label: 'Stok', icon: 'cube-outline' },
  { key: 'commercial_invoice', label: 'Finans', icon: 'cash-outline' },
  { key: 'shipment', label: 'Sevkiyat', icon: 'car-outline' },
  { key: 'installation', label: 'Kurulum', icon: 'construct-outline' },
];

export default function OpportunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('opportunities.update');
  const canApprove = useCan('opportunities.approve');
  const canReadAssignees = useCan('opportunities.create');

  // Aşama sayfası: hedef aşama + LOST için zorunlu kayıp alanları
  const [targetStage, setTargetStage] = useState<QualificationStage | null>(null);
  const [lostReasonCode, setLostReasonCode] = useState<string | null>(null);
  const [lostProductName, setLostProductName] = useState('');
  const [lostUnmetConditions, setLostUnmetConditions] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [competitorModel, setCompetitorModel] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useOpportunity(id);
  const activityList = useActivityList({ opportunityId: id });
  const assignees = useOpportunityAssignees(canReadAssignees);
  const setStage = useSetQualificationStage();
  const setCheck = useSetProcessCheck();
  const decideApproval = useDecideOpportunityApproval();
  const closeCase = useCloseOpportunity();
  const reopenCase = useReopenOpportunity();
  const updateOpp = useUpdateOpportunity();

  // Sonraki aksiyon hızlı düzenleme (web NextActionDialog karşılığı)
  const actionSheetRef = useRef<BottomSheetModal>(null);
  const [actionText, setActionText] = useState('');
  const [actionAt, setActionAt] = useState('');

  function openActionSheet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActionText(data?.nextAction ?? '');
    setActionAt(data?.nextActionAt ? formatInputDateTime(data.nextActionAt) : '');
    actionSheetRef.current?.present();
  }

  function submitAction() {
    const at = actionAt.trim() ? parseLocalDateTime(actionAt) : null;
    if (actionAt.trim() && !at) {
      Alert.alert('Biçim hatası', 'Takvim zamanı YYYY-AA-GG SS:DD biçiminde olmalı.');
      return;
    }
    if (!actionText.trim()) {
      Alert.alert('Aksiyon gerekli', 'Takvim zamanı girmek için önce aksiyon yazın.');
      return;
    }
    updateOpp.mutate(
      {
        id,
        nextAction: actionText.trim(),
        ...(at ? { nextActionAt: at.toISOString() } : {}),
      },
      {
        onSuccess: () => {
          actionSheetRef.current?.dismiss();
          toast.success('Sonraki aksiyon kaydedildi');
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  /** Aşama seçimi: LOST seçilirse web LostCaseDialog'unun zorunlu alanları açılır. */
  const chooseStage = useCallback((option: QualificationStage | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTargetStage(option);
    setLostReasonCode(null);
    setLostProductName('');
    setLostUnmetConditions('');
    setCompetitorName('');
    setCompetitorModel('');
    setStageNote('');
    setStageError(null);
  }, []);

  const applyStage = useCallback(
    (stage: QualificationStage) => {
      // Web ile aynı zorunluluklar (LostCaseDialog submit doğrulaması).
      if (stage === 'lost' && (!lostReasonCode || !lostProductName.trim() || !lostUnmetConditions.trim())) {
        setStageError('Kayıp nedeni, kaybedilen ürün ve karşılanamayan şartlar zorunludur.');
        return;
      }
      sheetRef.current?.dismiss();
      setStage.mutate(
        {
          id,
          toStage: stage,
          ...(stage === 'lost'
            ? {
                cancellationReasonCode: lostReasonCode!,
                lostProductName: lostProductName.trim(),
                lostUnmetConditions: lostUnmetConditions.trim(),
                ...(competitorName.trim() ? { lostCompetitorName: competitorName.trim() } : {}),
                ...(competitorModel.trim() ? { lostCompetitorProductModel: competitorModel.trim() } : {}),
              }
            : stageNote.trim()
              ? { note: stageNote.trim() }
              : {}),
        },
        {
          // Sunucu geçiş kurallarını doğruluyor; reddi kullanıcıya aynen göster.
          onError: (err) => Alert.alert('Aşama değiştirilemedi', err.message),
        }
      );
    },
    [id, setStage, lostReasonCode, lostProductName, lostUnmetConditions, competitorName, competitorModel, stageNote]
  );

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Fırsat" />
        {isPending ? <Loading /> : <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />}
      </SafeAreaView>
    );
  }

  const stage = (QUALIFICATION_STAGES.includes(data.qualificationStage as QualificationStage) ? data.qualificationStage : 'lead') as QualificationStage;

  const company = data.company?.legalTitle ?? data.leadCompanyTitle ?? null;
  const contactName = data.primaryContact?.fullName ?? data.leadContactName ?? null;
  const phone = data.leadPhone;
  const ownerName = data.ownerUserId ? assignees.data?.find((a) => a.id === data.ownerUserId)?.fullName ?? null : null;
  const activities = activityList.data?.items ?? [];

  const checks = data.qualificationReadiness?.checks ?? [];
  const checklistDone = checks.filter((c) => c.complete).length;
  const evidenceByKey = new Map(data.processReadiness?.checks.map((c) => [c.key, c.complete]) ?? []);
  const activityCount = activityList.data?.total ?? 0;

  // Arşiv durumu + onay haritası (web SalesCaseDetail ile aynı kaynaklar)
  const isClosed = Boolean(data.closedAt);
  const approvals = data.approvals ?? {};
  const pendingApprovals = OPPORTUNITY_APPROVAL_TYPES.filter((type) => approvals[type] === 'pending');
  const settledApprovals = OPPORTUNITY_APPROVAL_TYPES.filter((type) => approvals[type] && approvals[type] !== 'pending');

  /** Geriye geçiş web'de zorunlu gerekçe ister; aynı kural istemcide uygulanır. */
  const ACTIVE_ORDER: QualificationStage[] = ['lead', 'c', 'b', 'a', 'a_plus'];
  const isBackwardMove =
    targetStage !== null &&
    !['win', 'lost'].includes(targetStage) &&
    ACTIVE_ORDER.indexOf(targetStage) < ACTIVE_ORDER.indexOf(stage);

  function toggleCheck(key: string, complete: boolean) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheck.mutate(
      { id, key, body: { status: complete ? 'not_done' : 'done' } },
      { onError: (err) => Alert.alert('Adım güncellenemedi', err.message) }
    );
  }

  function handleApprovalDecision(type: OpportunityApprovalType, decision: 'approved' | 'rejected') {
    if (decision === 'approved') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      decision === 'approved' ? `${opportunityApprovalTypeLabels[type]} — Onayla` : `${opportunityApprovalTypeLabels[type]} — Reddet`,
      'Karar kaydedilecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Onayla',
          style: 'destructive',
          onPress: () =>
            decideApproval.mutate(
              { id, type, decision },
              {
                onSuccess: () => toast.success('Onay kararı kaydedildi'),
                onError: (err) => Alert.alert('Karar kaydedilemedi', err.message),
              }
            ),
        },
      ]
    );
  }

  function handleCloseCase() {
    closeCase.mutate(
      { id },
      {
        onSuccess: () => toast.success('Fırsat arşive kapatıldı'),
        onError: (err) => Alert.alert('Kapatılamadı', err.message),
      }
    );
  }

  function handleReopenCase() {
    reopenCase.mutate(id, {
      onSuccess: () => toast.success('Fırsat yeniden açıldı'),
      onError: (err) => Alert.alert('Yeniden açılamadı', err.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Fırsat Detayı" subtitle={company ?? undefined} />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Chip tone={STAGE_TONE[stage]} label={qualificationStageLabels[stage]} />
              <Text className="text-[20px] font-inter-semibold leading-[1.2] text-foreground">{data.title}</Text>
              {/* Fırsat kodu (örn. FIR-2025-0087) sunucuda yok — yalnızca UUID id var. [VERİ YOK] */}
            </View>
            <View className="items-end">
              <Text className="font-inter text-[11px] text-muted-foreground">Tahmini tutar</Text>
              <Text className="text-[19px] font-inter-bold text-foreground" numberOfLines={1}>
                {formatAmount(data.estimatedValue, data.currency?.code ?? 'TRY')}
              </Text>
              <Text className="font-inter text-[11px] text-muted-foreground">%{data.probability} olasılık</Text>
            </View>
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Firma', value: company },
              { label: 'İletişim', value: contactName },
              { label: 'Sorumlu', value: ownerName },
              { label: 'Telefon', value: phone },
              { label: 'Şehir', value: data.leadCity },
              { label: 'Operasyon aşaması', value: data.stage?.name },
              { label: 'Kaynak', value: data.source?.name },
              { label: 'Beklenen kapanış', value: data.expectedCloseDate ? formatDate(data.expectedCloseDate) : null },
              { label: 'Oluşturulma', value: formatDate(data.createdAt) },
            ]}
          />
        </Card>

        <View className="flex-row gap-3">
          {canUpdate ? <View className="flex-1">
            <Button
              label="Aşama Değiştir"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                chooseStage(null);
                sheetRef.current?.present();
              }}
            />
          </View> : null}
          {data.company?.id ? (
            <View className="flex-1">
              <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.company!.id}`)} />
            </View>
          ) : phone ? (
            <View className="flex-1">
              <Button label="Ara" variant="ghost" onPress={() => void Linking.openURL(`tel:${phone}`)} />
            </View>
          ) : null}
        </View>

        {/* Bitir / Yeniden Aç — web SalesCases "Bitir" ve Geçmiş görünümündeki geri alma */}
        {(stage === 'win' || stage === 'lost') && canUpdate ? (
          isClosed ? (
            <Button label="Yeniden Aç" variant="ghost" loading={reopenCase.isPending} disabled={reopenCase.isPending} onPress={handleReopenCase} />
          ) : (
            <Button
              label="Bitir ve Arşivle"
              variant="ghost"
              loading={closeCase.isPending}
              disabled={closeCase.isPending}
              onPress={() =>
                Alert.alert('Fırsatı Bitir', 'Kart arşive kapatılacak; Geçmiş görünümünden yeniden açabilirsin.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Bitir', style: 'destructive', onPress: handleCloseCase },
                ])
              }
            />
          )
        ) : null}

        {data.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.description}</Text>
          </Card>
        ) : null}

        <View className="gap-1.5">
          <View className="px-1">
            <Eyebrow>Modüller</Eyebrow>
          </View>
          <StatGrid columns={4}>
            <StatCard icon="pulse-outline" tone={activityCount > 0 ? 'info' : 'neutral'} label="Aktiviteler" value={String(activityCount)} />
            {MODULE_TILES.map((tile) => {
              const done = evidenceByKey.get(tile.key) ?? false;
              return (
                <StatCard key={tile.key} icon={tile.icon} tone={done ? 'success' : 'neutral'} label={tile.label} value={done ? 'Var' : 'Yok'} />
              );
            })}
          </StatGrid>
        </View>

        {checks.length > 0 ? (
          <Card className="gap-3">
            <ProgressBar done={checklistDone} total={checks.length} label="Fırsat Kontrol Listesi" />
            <View className="gap-2">
              {checks.map((check) => {
                const row = (
                  <View key={check.key} className="flex-row items-center gap-2">
                    <Ionicons
                      name={check.complete ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={check.complete ? colors.success : colors.mutedForeground}
                    />
                    <Text className={`flex-1 font-inter text-[13px] ${check.complete ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {check.label}
                    </Text>
                  </View>
                );
                // Yalnızca A+ alanı adımları elle işaretlenebilir (sunucu kuralı).
                if (!check.manualEditable || !canUpdate) return row;
                return (
                  <Pressable
                    key={check.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: check.complete }}
                    onPress={() => toggleCheck(check.key, check.complete)}
                    className="opacity-100 active:opacity-60"
                  >
                    {row}
                    {check.note ? (
                      <Text className="pl-6 font-inter text-[11px] text-muted-foreground">{check.note}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text className="font-inter text-[11px] text-muted-foreground">
              Dokunarak "yapıldı / yapılmadı" işaretleyebilirsin — yalnız A+ alanındaki adımlarda.
            </Text>
          </Card>
        ) : null}

        {(pendingApprovals.length > 0 || settledApprovals.length > 0) && canApprove ? (
          <Card className="gap-2">
            <Eyebrow>Onaylar</Eyebrow>
            {OPPORTUNITY_APPROVAL_TYPES.map((type) => {
              const status = approvals[type];
              if (!status) return null;
              return (
                <View key={type} className="gap-1.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 font-inter-medium text-[13px] text-foreground">{opportunityApprovalTypeLabels[type]}</Text>
                    <Chip
                      tone={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'}
                      label={status === 'approved' ? 'Onaylandı' : status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}
                    />
                  </View>
                  {status === 'pending' ? (
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button
                          label="Onayla"
                          onPress={() => handleApprovalDecision(type, 'approved')}
                          loading={decideApproval.isPending && decideApproval.variables?.type === type && decideApproval.variables?.decision === 'approved'}
                          disabled={decideApproval.isPending}
                        />
                      </View>
                      <View className="flex-1">
                        <Button
                          label="Reddet"
                          variant="ghost"
                          onPress={() => handleApprovalDecision(type, 'rejected')}
                          loading={decideApproval.isPending && decideApproval.variables?.type === type && decideApproval.variables?.decision === 'rejected'}
                          disabled={decideApproval.isPending}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : null}

        {canUpdate ? (
          <Button
            label={data.nextAction ? 'Sonraki Aksiyonu Düzenle' : 'Sonraki Aksiyon Planla'}
            variant="ghost"
            onPress={openActionSheet}
          />
        ) : null}

        {stage === 'lost' && (data.lostReason || data.lostCompetitor || data.lostProductName) ? (
          <Card className="gap-1.5">
            <Eyebrow>Kayıp Bilgileri</Eyebrow>
            <InfoRows
              items={[
                { label: 'Kayıp nedeni', value: data.lostReason?.name },
                { label: 'Kaybedilen ürün', value: data.lostProductName },
                { label: 'Rakip', value: data.lostCompetitor?.name },
                { label: 'Rakip ürünü', value: data.lostCompetitorProductModel },
                { label: 'Karşılanamayan koşullar', value: data.lostUnmetConditions },
              ]}
            />
          </Card>
        ) : null}

        {stage === 'win' && data.wonReason ? (
          <Card className="gap-1.5">
            <Eyebrow>Kazanılma Nedeni</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.wonReason}</Text>
          </Card>
        ) : null}

        <View className="gap-1.5">
          <View className="px-1">
            <Eyebrow>Aktiviteler ({activityCount})</Eyebrow>
          </View>
          {activityList.isPending ? (
            <Loading />
          ) : activities.length === 0 ? (
            <Card>
              <Text className="text-center font-inter text-sm text-muted-foreground">Henüz aktivite yok.</Text>
            </Card>
          ) : (
            activities
              .slice(0, 10)
              .map((activity) => (
                <ListRow
                  key={activity.id}
                  title={activity.subject}
                  lines={[activity.type?.name, formatDateTime(activity.activityDate), activity.result]}
                  icon="pulse-outline"
                  iconTone={activity.origin === 'system' ? 'neutral' : 'info'}
                />
              ))
          )}
        </View>
      </ScrollView>

      {canUpdate ? <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Satış derecesi</Text>
          <Text className="mb-2 font-inter text-xs text-muted-foreground">Geçiş kuralları sunucuda doğrulanır; uygun olmayan seçim reddedilir.</Text>
          {QUALIFICATION_STAGES.map((option) => (
            <Button
              key={option}
              label={qualificationStageLabels[option]}
              variant={option === stage ? 'primary' : targetStage === option ? 'destructive' : 'ghost'}
              onPress={() => chooseStage(option)}
            />
          ))}

          {/* LOST: web LostCaseDialog'unun zorunlu alanları */}
          {targetStage === 'lost' ? (
            <View className="mt-2 gap-3">
              <Eyebrow>Kayıp Nedeni *</Eyebrow>
              <View className="flex-row flex-wrap gap-2">
                {LOST_REASONS.map((reason) => {
                  const active = lostReasonCode === reason.code;
                  return (
                    <Pressable
                      key={reason.code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setLostReasonCode(active ? null : reason.code)}
                      className={`self-start rounded-full border px-3 py-1.5 ${active ? 'border-destructive bg-destructive/10' : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-medium text-xs ${active ? 'text-destructive' : 'text-foreground'}`}>
                        {reason.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label="Kaybedilen ürün *"
                value={lostProductName}
                onChangeText={(v) => setLostProductName(v)}
                placeholder={data.requestedMachine ?? 'Örn. VM-2 Dikey İşleme Merkezi'}
              />
              <Field
                label="Karşılanamayan şartlar *"
                value={lostUnmetConditions}
                onChangeText={(v) => setLostUnmetConditions(v)}
                placeholder="Örn. teslim süresi 6 ay istendi, 4 ay karşılanamadı"
                multiline
                numberOfLines={2}
              />
              <Field label="Rakip firma (opsiyonel)" value={competitorName} onChangeText={(v) => setCompetitorName(v)} placeholder="Örn. Şahintek Makina" />
              <Field label="Rakip ürün/model (opsiyonel)" value={competitorModel} onChangeText={(v) => setCompetitorModel(v)} />
            </View>
          ) : null}

          {/* Geriye geçiş: web'deki zorunlu gerekçe notu */}
          {targetStage !== null && isBackwardMove ? (
            <View className="mt-2">
              <Field
                label="Geriye geçiş gerekçesi *"
                value={stageNote}
                onChangeText={(v) => setStageNote(v)}
                placeholder="Neden geri alındığını kısaca yazın"
                multiline
                numberOfLines={2}
              />
            </View>
          ) : null}

          {stageError ? <Text className="font-inter text-xs text-destructive">{stageError}</Text> : null}

          {targetStage && targetStage !== stage ? (
            <Button
              label={`${qualificationStageLabels[targetStage]} Yap`}
              onPress={() => applyStage(targetStage)}
              loading={setStage.isPending}
              disabled={setStage.isPending}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal> : null}
    
      <BottomSheetModal
        ref={actionSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Sonraki Aksiyon</Text>
          <Field
            label="Aksiyon"
            value={actionText}
            onChangeText={setActionText}
            placeholder="Örn. müşteriyi ara, teklifi takip et"
            multiline
            numberOfLines={2}
          />
          <Field
            label="Zaman"
            value={actionAt}
            onChangeText={setActionAt}
            placeholder="YYYY-AA-GG SS:DD"
            keyboardType="numbers-and-punctuation"
            maxLength={16}
          />
          <Button
            label="Kaydet"
            onPress={submitAction}
            loading={updateOpp.isPending}
            disabled={updateOpp.isPending}
          />
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function formatInputDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
