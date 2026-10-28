import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCommitCompanyContactImport, usePreviewCompanyContactImport } from '@/src/api/crm-general.hooks';
import type { CompanyContactImportPreview } from '@/src/api/crm-general.api';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, Eyebrow } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { validateImportFile } from '@/src/ui/crm/company-logic';
import { pickBase64File, type PickedBase64File } from '@/src/ui/crm/pick-file';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function FilePick({
  label,
  helper,
  file,
  onPick,
  disabled,
}: {
  label: string;
  helper: string;
  file: PickedBase64File | null;
  onPick: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card className="gap-2 p-4">
      <Text className="font-inter-semibold text-sm text-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} seç`}
        disabled={disabled}
        onPress={onPick}
        className="min-h-12 flex-row items-center gap-3 rounded-control border border-dashed border-border px-3 active:bg-muted"
      >
        <Ionicons name={file ? 'document-attach' : 'document-outline'} size={20} color={file ? colors.primary : colors.mutedForeground} />
        <Text className={`flex-1 font-inter text-sm ${file ? 'text-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
          {file ? file.fileName : 'Dosya seçin'}
        </Text>
      </Pressable>
      <Text className="font-inter text-xs text-muted-foreground">{helper}</Text>
    </Card>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'success' | 'info' }) {
  return (
    <Card className="min-w-[46%] flex-1 gap-1 p-3">
      <Text className="font-inter text-xs text-muted-foreground">{label}</Text>
      <Text className={`font-display text-2xl ${tone === 'success' ? 'text-success' : 'text-info'}`}>{value}</Text>
    </Card>
  );
}

/** Web CompanyContactImportDialog (yalnız super_admin). */
export default function CompanyImportScreen() {
  const { divisionId } = useLocalSearchParams<{ divisionId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const preview = usePreviewCompanyContactImport();
  const commit = useCommitCompanyContactImport();
  const [companiesFile, setCompaniesFile] = useState<PickedBase64File | null>(null);
  const [contactsFile, setContactsFile] = useState<PickedBase64File | null>(null);
  const [result, setResult] = useState<CompanyContactImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (!user?.roles.includes('super_admin')) return <Redirect href="/modules/companies" />;

  const busy = preview.isPending || commit.isPending;
  const scopedDivision = divisionId && divisionId !== 'all' ? divisionId : undefined;

  async function pick(setter: (file: PickedBase64File) => void) {
    try {
      const picked = await pickBase64File({
        types: [XLSX_MIME],
        fallbackMimeType: XLSX_MIME,
        validate: (file) => validateImportFile(file),
      });
      if (!picked) return;
      if ('error' in picked) {
        toast.error(picked.error);
        return;
      }
      setter(picked.file);
      setResult(null);
      setConfirmed(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya okunamadı');
    }
  }

  function payload() {
    if (!companiesFile || !contactsFile) return null;
    return {
      companiesFile: { fileName: companiesFile.fileName, mimeType: companiesFile.mimeType, fileBase64: companiesFile.fileBase64 },
      contactsFile: { fileName: contactsFile.fileName, mimeType: contactsFile.mimeType, fileBase64: contactsFile.fileBase64 },
      ...(scopedDivision ? { divisionId: scopedDivision } : {}),
    };
  }

  function createPreview() {
    const body = payload();
    if (!body) return;
    preview.mutate(body, {
      onSuccess: (data) => {
        setResult(data);
        setConfirmed(false);
        toast.success(`Excel dosyaları incelendi · ${data.summary.companyRows} firma, ${data.summary.contactRows} kontak satırı bulundu.`);
      },
      onError: (error) => {
        setResult(null);
        toast.error(`Dosyalar incelenemedi · ${error.message || 'Önizleme oluşturulamadı.'}`);
      },
    });
  }

  function runCommit() {
    const body = payload();
    if (!body || !result || !confirmed) return;
    commit.mutate(body, {
      onSuccess: (data) => {
        toast.success(
          `Firma ve kontak aktarımı tamamlandı · ${data.companies.created} firma ve ${data.contacts.created} kontak oluşturuldu; ${data.companies.updated + data.contacts.updated} kayıt güncellendi.`,
        );
        router.back();
      },
      onError: (error) => toast.error(`İçe aktarma tamamlanamadı · ${error.message || 'Sunucu isteği başarısız oldu.'}`),
    });
  }

  const summary = result?.summary;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Firma ve kontak içe aktarımı', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
        <Text className="font-inter text-sm text-muted-foreground">
          Firma NO ile kontakları doğru firmaya bağlar; var olan kayıtları boş alanlarla silmeden günceller.
        </Text>
        <FilePick
          label="Firma Listesi (.xlsx)"
          helper="NO sütunu kalıcı firma numarası olarak kullanılır."
          file={companiesFile}
          disabled={busy}
          onPick={() => void pick(setCompaniesFile)}
        />
        <FilePick
          label="Kontak Listesi (.xlsx)"
          helper="FIRMA NO sütunu firma listesindeki NO ile eşleştirilir."
          file={contactsFile}
          disabled={busy}
          onPick={() => void pick(setContactsFile)}
        />

        {!result ? (
          <Button
            label={preview.isPending ? 'İnceleniyor…' : 'Önizleme Oluştur'}
            loading={preview.isPending}
            disabled={!companiesFile || !contactsFile || busy}
            onPress={createPreview}
          />
        ) : null}

        {summary && result ? (
          <>
            <View className="flex-row flex-wrap gap-3">
              <SummaryTile label="Yeni Firma" value={summary.companyCreates} tone="success" />
              <SummaryTile label="Güncellenecek Firma" value={summary.companyUpdates} tone="info" />
              <SummaryTile label="Yeni Kontak" value={summary.contactCreates} tone="success" />
              <SummaryTile label="Güncellenecek Kontak" value={summary.contactUpdates} tone="info" />
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Chip label={`Atlanan firma: ${summary.companySkipped}`} />
              <Chip label={`Atlanan kontak: ${summary.contactSkipped}`} />
              <Chip tone="warning" label={`Uyarı: ${summary.warnings}`} />
              <Chip tone="destructive" label={`Hata: ${summary.errors}`} />
            </View>

            {result.issues.length > 0 ? (
              <View className="gap-2">
                <Eyebrow>Kontrol listesi</Eyebrow>
                <Card className="px-3 py-1">
                  {result.issues.map((issue, index) => (
                    <View
                      key={`${issue.kind}-${issue.rowNumber}-${index}`}
                      className={`flex-row gap-3 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}
                    >
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color={issue.severity === 'error' ? colors.destructive : colors.warning}
                      />
                      <View className="flex-1">
                        <Text className="font-inter-medium text-sm text-foreground">
                          {issue.kind === 'company' ? 'Firma' : 'Kontak'} · Satır {issue.rowNumber}
                        </Text>
                        <Text className="font-inter text-xs text-muted-foreground">{`Satır ${issue.rowNumber} · ${issue.message}`}</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <Card className="flex-row items-start gap-3 p-4">
              <View className="flex-1">
                <Text className="font-inter-medium text-sm text-foreground">Önizlemeyi kontrol ettim, aktarımı onaylıyorum.</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  Aynı Firma No ve Kontak No ile yeniden yüklenen kayıtlar güncellenir.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Önizlemeyi kontrol ettim, aktarımı onaylıyorum."
                value={confirmed}
                onValueChange={setConfirmed}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </Card>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Yeniden İncele" variant="ghost" disabled={busy} onPress={createPreview} />
              </View>
              <View className="flex-1">
                <Button
                  label={commit.isPending ? 'Aktarılıyor…' : 'İçe Aktar'}
                  loading={commit.isPending}
                  disabled={!confirmed || busy}
                  onPress={runCommit}
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
