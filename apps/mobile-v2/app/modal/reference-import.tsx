import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import type { ReferenceImportResult } from '@/src/api/references.api';
import { useImportReferences } from '@/src/api/references.hooks';
import { useTheme } from '@/src/theme/theme';
import { Card } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { formatKb, importFileProblem, referenceTemplateCsv, TEMPLATE_HEADERS } from '@/src/ui/references/referenceLogic';

type Picked = { uri: string; name: string; size: number | null };

const IMPORT_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
];

async function shareTemplate() {
  const file = new File(Paths.cache, 'referans-sablonu.csv');
  if (file.exists) file.delete();
  file.create();
  file.write(referenceTemplateCsv());
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Referans şablonu' });
}

export default function ReferenceImportModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('companies.create');
  const [file, setFile] = useState<Picked | null>(null);
  const [result, setResult] = useState<ReferenceImportResult | null>(null);
  const importFile = useImportReferences();

  const pick = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: IMPORT_TYPES, copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      const next = { uri: asset.uri, name: asset.name, size: asset.size ?? null };
      const problem = importFileProblem(next);
      if (problem) {
        toast.error(problem);
        return;
      }
      setFile(next);
      setResult(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya seçilemedi');
    }
  };

  const upload = async () => {
    if (!file) {
      toast.error('Önce bir .xlsx veya .csv dosyası seçin');
      return;
    }
    try {
      const fileBase64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
      if (fileBase64.length > 12_000_000) {
        toast.error('Dosya en fazla 9 MB olabilir.');
        return;
      }
      const summary = await importFile.mutateAsync({ fileName: file.name, fileBase64 });
      setResult(summary);
      if (summary.created) {
        toast.success(
          summary.skipped.length
            ? `${summary.created} referans yüklendi · ${summary.skipped.length} satır atlandı.`
            : `${summary.created} referans yüklendi`,
        );
      } else {
        toast.error(summary.skipped[0]?.reason ? `Hiç referans yüklenmedi: ${summary.skipped[0].reason}` : 'Hiç referans yüklenmedi');
      }
    } catch (error) {
      toast.error(error instanceof Error && error.message ? `Yükleme başarısız: ${error.message}` : 'Yükleme başarısız');
    }
  };

  return (
    <ModalForm
      title="Referansları Excel ile Yükle"
      submitLabel={importFile.isPending ? 'Yükleniyor…' : 'Yükle'}
      onSubmit={() => void upload()}
      loading={importFile.isPending}
      disabled={!file || !canCreate}
    >
      <Text className="font-inter text-sm text-muted-foreground">
        Sütunlar: {TEMPLATE_HEADERS.join(', ')}. Yalnızca "Firma" zorunludur; aynı firma/model/tarih tekrar yüklenmez.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Şablonu indir (.csv)"
        onPress={() => void shareTemplate().catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Şablon hazırlanamadı'))}
        className="min-h-[44px] flex-row items-center gap-1.5 self-start rounded-control border border-border bg-card px-3 active:opacity-70"
      >
        <Ionicons name="download-outline" size={17} color={colors.primary} />
        <Text className="font-inter-medium text-sm text-foreground">Şablonu indir (.csv)</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={file ? `Seçili dosya ${file.name}. Değiştir` : 'Dosya seç'}
        onPress={() => void pick()}
        className="min-h-[72px] flex-row items-center gap-3 rounded-control border border-dashed border-border bg-card-subtle p-4 active:opacity-70"
      >
        <Ionicons name="document-text-outline" size={26} color={colors.mutedForeground} />
        <View className="flex-1">
          <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>{file ? file.name : 'Dosya seç'}</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            {file ? (file.size != null ? formatKb(file.size) : 'Boyut bilinmiyor') : '.xlsx veya .csv · en fazla 2.000 satır'}
          </Text>
        </View>
      </Pressable>
      {result ? (
        <Card className="gap-2">
          <Text className="font-inter text-sm text-foreground">
            <Text className="font-inter-semibold">{result.created}</Text> referans yüklendi · başlık satırı {result.headerRow} ({result.sheetName})
          </Text>
          {result.skipped.map((item) => (
            <Text key={item.row} className="font-inter text-xs text-muted-foreground">
              Satır {item.row}: {item.reason}
            </Text>
          ))}
          {result.created ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Listeye dön" onPress={() => router.back()} className="min-h-[44px] justify-center self-start active:opacity-60">
              <Text className="font-inter-semibold text-sm text-primary">Listeye dön</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
    </ModalForm>
  );
}
