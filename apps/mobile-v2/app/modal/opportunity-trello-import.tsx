import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { TrelloCompanyCandidate } from '@haksan/shared';
import type { TrelloImportPreview, TrelloImportPreviewRow } from '@/src/api/sales.api';
import { useCommitTrelloImport, usePreviewTrelloImport } from '@/src/api/sales.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { activeScope } from '@/src/auth/scope';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, Eyebrow, Field } from '@/src/ui';
import { CompanyPickerSheet } from '@/src/ui/sales/CompanyPickerSheet';
import { PillGroup } from '@/src/ui/sales/Sheet';
import { DistrictSelect, ProvinceSelect } from '@/src/ui/select/fields';
import {
  PIPELINE_FLOW,
  PIPELINE_STAGE_LABELS,
  TRELLO_NO_LIST,
  trelloCommitRows,
  trelloListKey,
  trelloPendingCount,
  trelloRowKey,
  type TrelloDecision,
} from '@/src/ui/sales/sales-logic';
import { toast } from '@/src/ui/toast';

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const CURRENCIES = ['EUR', 'USD', 'TRY', 'GBP'] as const;
type Currency = (typeof CURRENCIES)[number];
const STAGE_OPTIONS = PIPELINE_FLOW.filter((stage) => stage !== 'lead').map((stage) => ({ value: stage, label: PIPELINE_STAGE_LABELS[stage] ?? stage }));

function statusLabel(row: TrelloImportPreviewRow): { label: string; tone: 'neutral' | 'destructive' } {
  if (row.status === 'skip') return { label: 'Mükerrer', tone: 'neutral' };
  return { label: 'Hatalı', tone: 'destructive' };
}

/** Web TrelloCsvImportDialog: CSV önizleme → kart başına firma kararı → aktarım. */
export default function TrelloImportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const canImport = useCan('opportunities.create');
  const previewMutation = usePreviewTrelloImport();
  const commitMutation = useCommitTrelloImport();
  const pickerRef = useRef<BottomSheetModal>(null);

  const divisions = useMemo(() => user?.divisions ?? [], [user?.divisions]);
  const [divisionId, setDivisionId] = useState<string | null>(() => {
    const active = activeScope().divisionId;
    if (active && active !== 'all') return active;
    return divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? null;
  });
  const [currencyCode, setCurrencyCode] = useState<Currency>('EUR');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<TrelloImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, TrelloDecision>>({});
  const [candidates, setCandidates] = useState<Record<string, TrelloCompanyCandidate>>({});
  const [stageByList, setStageByList] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerRow, setPickerRow] = useState<string | null>(null);

  const importRows = useMemo(() => preview?.rows.filter((row) => row.status === 'create') ?? [], [preview]);
  const pending = trelloPendingCount(importRows, decisions);
  const invalidCandidates = importRows.filter((row) => {
    const decision = decisions[trelloRowKey(row)];
    if (!decision || decision.action === 'pending' || decision.action === 'skip') return false;
    return !(candidates[trelloRowKey(row)] ?? row.candidate).companyTitle.trim();
  }).length;
  const skipped = importRows.filter((row) => decisions[trelloRowKey(row)]?.action === 'skip').length;
  const listMappings = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; suggested: string }>();
    for (const row of importRows) {
      const key = trelloListKey(row);
      const current = map.get(key);
      map.set(key, { key, label: key === TRELLO_NO_LIST ? 'Liste bilgisi yok' : key, count: (current?.count ?? 0) + 1, suggested: current?.suggested ?? row.stageCode });
    }
    return Array.from(map.values());
  }, [importRows]);

  if (!canImport) return <Redirect href={'/modules/opportunities' as Href} />;

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (!asset.name.toLocaleLowerCase('tr-TR').endsWith('.csv')) {
        toast.error('Yalnızca Trello CSV dosyası seçebilirsiniz');
        return;
      }
      const file = new File(asset.uri);
      if ((asset.size ?? file.size) > MAX_CSV_BYTES) {
        toast.error("CSV dosyası 2 MB'ı aşamaz");
        return;
      }
      const fileBase64 = await file.base64();
      setFileName(asset.name);
      previewMutation.mutate(
        { fileName: asset.name, fileBase64 },
        {
          onSuccess: (next) => {
            setPreview(next);
            const nextDecisions: Record<string, TrelloDecision> = {};
            const nextCandidates: Record<string, TrelloCompanyCandidate> = {};
            const nextStages: Record<string, string> = {};
            for (const row of next.rows) {
              if (row.status !== 'create') continue;
              nextDecisions[trelloRowKey(row)] = { action: 'pending' };
              nextCandidates[trelloRowKey(row)] = row.candidate;
              const listKey = trelloListKey(row);
              if (!nextStages[listKey]) nextStages[listKey] = row.stageCode;
            }
            setDecisions(nextDecisions);
            setCandidates(nextCandidates);
            setStageByList(nextStages);
            toast.success(
              `Trello kartları karşılaştırmaya hazır · ${next.summary.create} kart için firma kararı gerekiyor; ${next.summary.skip} mükerrer, ${next.summary.error} hatalı.`
            );
          },
          onError: (error) => {
            setPreview(null);
            toast.error(`Trello CSV okunamadı · ${error.message}`);
          },
        }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya seçilemedi');
    }
  }

  function setDecision(row: TrelloImportPreviewRow, decision: TrelloDecision) {
    setDecisions((current) => ({ ...current, [trelloRowKey(row)]: decision }));
  }

  function patchCandidate(row: TrelloImportPreviewRow, patch: Partial<TrelloCompanyCandidate>) {
    const key = trelloRowKey(row);
    setCandidates((current) => ({ ...current, [key]: { ...(current[key] ?? row.candidate), ...patch } }));
  }

  function commit() {
    if (!preview || !divisionId || !importRows.length || pending || invalidCandidates) return;
    const rows = trelloCommitRows(importRows, decisions, { stageByList, candidates });
    commitMutation.mutate(
      { divisionId, currencyCode, rows: rows as Parameters<typeof commitMutation.mutate>[0]['rows'] },
      {
        onSuccess: (result) => {
          if (result.summary.error) {
            toast.info(
              `Trello aktarımı kısmen tamamlandı · ${result.summary.create} satış kartı oluşturuldu, ${result.summary.skip} atlandı, ${result.summary.error} hata oluştu.`
            );
          } else {
            toast.success(`Firma kararlarıyla birlikte aktarıldı · ${result.summary.create} satış kartı oluşturuldu, ${result.summary.skip} kart atlandı.`);
          }
          router.back();
        },
        onError: (error) => toast.error(`Trello aktarımı tamamlanamadı · ${error.message}`),
      }
    );
  }

  const footerText = !preview
    ? 'Önce CSV dosyasını seçin.'
    : invalidCandidates > 0
      ? `${invalidCandidates} kartta firma adı boş bırakılamaz.`
      : pending > 0
        ? `${pending} kart için mevcut firma, yeni firma veya atla kararı verin.`
        : 'Tüm kart kararları tamamlandı.';

  const header = (
    <View className="gap-4 pb-3">
      <View className="gap-1">
        <Text className="font-display text-xl text-foreground">Trello Kartlarını Firma Kararıyla Aktar</Text>
        <Text className="font-inter text-sm text-muted-foreground">
          CRM ana kayıttır. Trello verisini karşılaştırın; her kartı mevcut firmaya bağlayın, yeni Potansiyel firma açın veya atlayın.
        </Text>
      </View>
      <Card className="gap-3">
        <Eyebrow>CSV dosyası</Eyebrow>
        <Text className="font-inter text-sm text-foreground" numberOfLines={1}>{fileName ?? 'Dosya seçilmedi'}</Text>
        <Button label={previewMutation.isPending ? 'Önizleniyor…' : 'CSV seç'} loading={previewMutation.isPending} trailingIcon="document-outline" onPress={() => void pickFile()} />
        {divisions.length > 0 ? (
          <PillGroup label="Bölüm" options={divisions.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={setDivisionId} allowClear={false} />
        ) : (
          <Text className="font-inter text-xs text-destructive">Hesabınıza bağlı bölüm bulunamadı.</Text>
        )}
        <PillGroup label="Para birimi" options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={currencyCode} onChange={(v) => v && setCurrencyCode(v)} allowClear={false} />
      </Card>
      {preview ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            <Chip tone="neutral" label={`Toplam ${preview.summary.total}`} />
            <Chip tone={pending ? 'destructive' : 'success'} label={`Karar bekleyen ${pending}`} />
            <Chip tone="neutral" label={`Bilinçli atlanan ${skipped}`} />
            <Chip tone="neutral" label={`Mükerrer ${preview.summary.skip}`} />
            <Chip tone={preview.summary.error ? 'destructive' : 'neutral'} label={`Hatalı ${preview.summary.error}`} />
          </View>
          {listMappings.length > 0 ? (
            <Card className="gap-3">
              <View className="gap-0.5">
                <Text className="font-inter-semibold text-sm text-foreground">Trello listesi → CRM aşaması</Text>
                <Text className="font-inter text-xs text-muted-foreground">Liste eşlemesini firma kararlarından bağımsız düzenleyebilirsiniz.</Text>
              </View>
              {listMappings.map((mapping) => (
                <PillGroup
                  key={mapping.key}
                  label={`${mapping.label} · ${mapping.count} kart`}
                  options={STAGE_OPTIONS}
                  value={(stageByList[mapping.key] ?? mapping.suggested) as (typeof STAGE_OPTIONS)[number]['value']}
                  onChange={(v) => v && setStageByList((current) => ({ ...current, [mapping.key]: v }))}
                  allowClear={false}
                />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Trello CSV', headerShown: true }} />
      <FlatList
        data={preview?.rows ?? []}
        keyExtractor={(row) => trelloRowKey(row)}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: row }) => {
          const key = trelloRowKey(row);
          if (row.status !== 'create') {
            const status = statusLabel(row);
            return (
              <Card className="gap-1 opacity-80">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="flex-1 font-inter-medium text-sm text-foreground">{row.title}</Text>
                  <Chip tone={status.tone} label={status.label} />
                </View>
                <Text className="font-inter text-xs text-muted-foreground">
                  {row.errors.join(', ') || row.warnings.join(', ') || row.cardUrl || row.externalReference}
                </Text>
              </Card>
            );
          }
          const decision = decisions[key] ?? { action: 'pending' as const };
          const candidate = candidates[key] ?? row.candidate;
          const stage = stageByList[trelloListKey(row)] ?? row.stageCode;
          return (
            <Card className="gap-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground">Satır {row.rowNumber}</Text>
                <Chip tone="info" label={PIPELINE_STAGE_LABELS[stage] ?? stage} />
                {decision.action === 'pending' ? <Chip tone="destructive" label="Karar bekliyor" /> : null}
                {decision.action === 'existing' ? <Chip tone="info" label="Mevcut firma" /> : null}
                {decision.action === 'create' ? <Chip tone="success" label="Yeni Potansiyel" /> : null}
                {decision.action === 'skip' ? <Chip tone="neutral" label="Atlanacak" /> : null}
              </View>
              <Text className="font-display text-lg text-foreground">{row.title}</Text>
              <View className="flex-row flex-wrap items-center gap-x-3">
                <Text className="font-inter text-xs text-muted-foreground">{row.boardName || 'Pano yok'} / {row.listName || 'Liste yok'}</Text>
                {row.cardUrl ? (
                  <Pressable accessibilityRole="link" accessibilityLabel="Trello kartını aç" onPress={() => void Linking.openURL(row.cardUrl!)} className="min-h-11 justify-center">
                    <Text className="font-inter-medium text-xs text-primary">Trello kartı</Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: expanded === key }}
                onPress={() => setExpanded(expanded === key ? null : key)}
                className="min-h-11 flex-row items-center justify-between rounded-control border border-border px-3 active:opacity-70"
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-medium text-xs text-muted-foreground">Trello’dan çıkarılan bilgi</Text>
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{candidate.companyTitle || 'Firma adı boş'}</Text>
                </View>
                <Ionicons name={expanded === key ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </Pressable>
              {expanded === key ? (
                <View className="gap-2">
                  <Text className="font-inter text-[11px] text-muted-foreground">Bu alanları firma kararından önce düzeltebilirsiniz.</Text>
                  <Field label="Firma adayı" value={candidate.companyTitle} onChangeText={(v) => patchCandidate(row, { companyTitle: v })} placeholder="Firma ünvanı" />
                  {candidate.locationHint ? <Text className="font-inter text-[11px] text-muted-foreground">Konum ipucu: {candidate.locationHint}</Text> : null}
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <ProvinceSelect
                        value={candidate.province ?? ''}
                        onChange={(province) =>
                          patchCandidate(row, {
                            province: province || undefined,
                            district: undefined,
                            locationHint: province || undefined,
                          })
                        }
                      />
                    </View>
                    <View className="flex-1">
                      <DistrictSelect
                        province={candidate.province ?? ''}
                        value={candidate.district ?? ''}
                        onChange={(district) =>
                          patchCandidate(row, {
                            district: district || undefined,
                            locationHint: [district, candidate.province].filter(Boolean).join(' / ') || undefined,
                          })
                        }
                      />
                    </View>
                  </View>
                  <Field label="Kontak adayı" value={candidate.contactName ?? ''} onChangeText={(v) => patchCandidate(row, { contactName: v || undefined })} placeholder="Ad soyad" />
                  <Field label="Telefon" value={candidate.phone ?? ''} onChangeText={(v) => patchCandidate(row, { phone: v || undefined })} placeholder="05xx xxx xx xx" keyboardType="phone-pad" />
                  <Field label="E-posta" value={candidate.email ?? ''} onChangeText={(v) => patchCandidate(row, { email: v || undefined })} placeholder="firma@example.com" keyboardType="email-address" autoCapitalize="none" />
                  {row.description ? (
                    <View className="gap-1 rounded-control bg-muted p-3">
                      <Text className="font-inter-medium text-xs text-foreground">Kart açıklaması</Text>
                      <Text className="font-inter text-xs text-muted-foreground" numberOfLines={8}>{row.description}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="gap-2">
                <Text className="font-inter-semibold text-sm text-foreground">CRM ana kayıt · {row.matches.length} öneri</Text>
                {row.matches.length === 0 ? (
                  <Text className="font-inter text-xs text-muted-foreground">
                    Yeterli benzerlikte CRM firması bulunamadı. Yeni Potansiyel firma taslağını kontrol edin veya manuel firma arayın.
                  </Text>
                ) : (
                  row.matches.map((match) => {
                    const selected = decision.action === 'existing' && decision.companyId === match.id;
                    return (
                      <Pressable
                        key={match.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${match.legalTitle}, yüzde ${match.score} eşleşme`}
                        onPress={() =>
                          setDecision(row, {
                            action: 'existing',
                            companyId: match.id,
                            ...(match.contactMatch ? { primaryContactId: match.contactMatch.id } : {}),
                            createContact: false,
                            addSecondaryPhone: false,
                            addSecondaryEmail: false,
                          })
                        }
                        className={`min-h-11 flex-row items-start gap-3 rounded-control border p-3 active:opacity-70 ${selected ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                      >
                        <View className="min-w-0 flex-1 gap-0.5">
                          <Text className="font-inter-semibold text-xs text-foreground">{match.legalTitle}</Text>
                          <Text className="font-inter text-[11px] text-muted-foreground">{match.reasons.join(' · ')}</Text>
                          {match.contactMatch ? (
                            <Text className="font-inter text-[11px] text-success">Kontak: {match.contactMatch.fullName} · {match.contactMatch.reason}</Text>
                          ) : null}
                        </View>
                        <Chip tone={match.confidence === 'strong' ? 'success' : 'warning'} label={`%${match.score}`} />
                      </Pressable>
                    );
                  })
                )}
                <Button
                  label={decision.action === 'existing' && !row.matches.some((m) => m.id === decision.companyId) ? 'Manuel seçilen firma · değiştir' : 'CRM’de manuel firma seç'}
                  variant="ghost"
                  onPress={() => {
                    setPickerRow(key);
                    pickerRef.current?.present();
                  }}
                />
              </View>

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Yeni firma"
                    variant={decision.action === 'create' ? 'primary' : 'ghost'}
                    disabled={!preview?.capabilities.canCreateCompany}
                    onPress={() =>
                      setDecision(row, { action: 'create', createContact: Boolean(preview?.capabilities.canCreateContact && candidate.contactName) })
                    }
                  />
                </View>
                <View className="flex-1">
                  <Button label="Atla" variant={decision.action === 'skip' ? 'primary' : 'ghost'} onPress={() => setDecision(row, { action: 'skip' })} />
                </View>
              </View>
              {decision.action === 'create' ? (
                <View className="gap-2 rounded-control border border-success-border bg-success-soft p-3">
                  <Text className="font-inter text-xs text-muted-foreground">
                    <Text className="font-inter-semibold text-foreground">{candidate.companyTitle}</Text> seçilen bölümde Potansiyel açılır. İlk satış siparişinde Aktif müşteriye dönüşür.
                  </Text>
                  {preview?.capabilities.canCreateContact && candidate.contactName ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: decision.createContact }}
                      onPress={() => setDecision(row, { ...decision, createContact: !decision.createContact })}
                      className="min-h-11 flex-row items-center gap-2"
                    >
                      <Ionicons name={decision.createContact ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
                      <Text className="flex-1 font-inter text-xs text-foreground">{candidate.contactName} kontağını da oluştur</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
      <View className="gap-2 border-t border-border bg-card px-4 py-3">
        <Text className="font-inter text-xs text-muted-foreground">{footerText}</Text>
        <View className="flex-row gap-3">
          <View className="flex-1"><Button label="Kapat" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]">
            <Button
              label={commitMutation.isPending ? 'Aktarılıyor...' : `${Math.max(0, importRows.length - skipped)} Kartı Satışa Aktar`}
              loading={commitMutation.isPending}
              disabled={!preview || !importRows.length || !divisionId || pending > 0 || invalidCandidates > 0 || commitMutation.isPending}
              onPress={commit}
            />
          </View>
        </View>
      </View>
      <CompanyPickerSheet
        ref={pickerRef}
        title="CRM’de manuel firma seç"
        onSelect={(company) => {
          pickerRef.current?.dismiss();
          const row = importRows.find((r) => trelloRowKey(r) === pickerRow);
          if (row) {
            setDecision(row, { action: 'existing', companyId: company.id, createContact: false, addSecondaryPhone: false, addSecondaryEmail: false });
          }
          setPickerRow(null);
        }}
      />
    </SafeAreaView>
  );
}
