import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/src/auth/AuthProvider';
import { activeScope } from '@/src/auth/scope';
import { useCommitProductImport, useImportTemplateOptions, usePreviewProductImport } from '@/src/api/products.hooks';
import type { ImportPreview, ImportPreviewRow } from '@/src/api/products.api';
import { downloadAndShare, pickDocument, type LocalUpload } from '@/src/native/files';
import { formatAmount } from '@/src/lib/format';
import { Button, Card, Chip, Eyebrow } from '@/src/ui';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { FormScreen, KpiGrid, KpiTile, SmallButton } from '@/src/ui/finance/kit';
import type { Tone } from '@/src/theme/theme';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const STATUS: Record<ImportPreviewRow['status'], { label: string; tone: Tone }> = {
  create: { label: 'Yeni', tone: 'success' },
  update: { label: 'Güncelle', tone: 'info' },
  skip: { label: 'Atla', tone: 'neutral' },
  error: { label: 'Hata', tone: 'destructive' },
};

/** Web `ProductImportDialog`: bölüm şablonu, XLSX ön izleme ve geçerli satırları aktarma. */
export default function ProductImportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const allowed = roles.includes('super_admin') || roles.includes('admin') || (user?.permissions ?? []).includes('products.create');
  const [divisionId, setDivisionId] = useState(activeScope().divisionId ?? '');
  const [categoryCode, setCategoryCode] = useState('');
  const [subcategoryCode, setSubcategoryCode] = useState('');
  const [productTypeCode, setProductTypeCode] = useState('');
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [downloading, setDownloading] = useState(false);
  const options = useImportTemplateOptions(divisionId || undefined);
  const previewImport = usePreviewProductImport();
  const commit = useCommitProductImport();

  const divisionName = user?.divisions?.find((division) => division.id === divisionId)?.name ?? 'Bölüm';
  const rows = options.data ?? [];
  const categories = useMemo(
    () => [...new Map(rows.filter((row) => row.categoryCode).map((row) => [row.categoryCode!, row.categoryName])).entries()],
    [rows],
  );
  const subcategories = useMemo(
    () => [
      ...new Map(
        rows
          .filter((row) => row.categoryCode === categoryCode && row.subcategoryCode)
          .map((row) => [row.subcategoryCode!, row.subcategoryName]),
      ).entries(),
    ],
    [rows, categoryCode],
  );
  const types = useMemo(
    () =>
      rows.filter(
        (row) => (!categoryCode || row.categoryCode === categoryCode) && (!subcategoryCode || row.subcategoryCode === subcategoryCode),
      ),
    [rows, categoryCode, subcategoryCode],
  );
  const validRows = useMemo(() => preview?.rows.filter((row) => row.status !== 'error' && row.status !== 'skip') ?? [], [preview]);

  if (!allowed) return <Redirect href={'/modules/products' as Href} />;

  async function downloadTemplate() {
    if (!divisionId) return toast.error('Önce aktarım bölümünü seçin');
    setDownloading(true);
    try {
      await downloadAndShare('/products/import/template', 'urun-import-sablonu.xlsx', {
        query: { divisionId, ...(productTypeCode ? { productTypeCode } : {}) },
      });
      toast.success(productTypeCode ? 'Şablon indirildi' : 'Genel şablon indirildi');
    } catch (error) {
      toast.error(`Şablon indirilemedi: ${error instanceof Error ? error.message : 'Bu tipte kayıtlı ürün olmayabilir.'}`);
    } finally {
      setDownloading(false);
    }
  }

  async function chooseFile() {
    if (!divisionId) return toast.error('Önce aktarım bölümünü seçin');
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (picked.extension !== 'xlsx' || picked.sizeBytes > MAX_IMPORT_BYTES) {
        toast.error('En fazla 10 MB boyutunda XLSX dosyası seçin');
        return;
      }
      setFile(picked);
      setPreview(null);
    } catch (error) {
      toast.error(`Dosya seçilemedi: ${error instanceof Error ? error.message : 'Dosya okunamadı.'}`);
    }
  }

  async function runPreview() {
    if (!divisionId) return toast.error('Önce aktarım bölümünü seçin');
    if (!file) return toast.error('Dosya seçilmedi');
    try {
      const fileBase64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
      const result = await previewImport.mutateAsync({ divisionId, fileName: file.name, fileBase64 });
      setPreview(result);
      toast.success(`Dosya okundu · ${result.summary.create} yeni, ${result.summary.update} güncelleme, ${result.summary.error} hata`);
    } catch (error) {
      setPreview(null);
      toast.error(`Dosya okunamadı: ${error instanceof Error ? error.message : 'Import ön izlemesi oluşturulamadı.'}`);
    }
  }

  function runCommit() {
    if (!preview || validRows.length === 0) return;
    commit.mutate(
      { divisionId, rows: validRows, mode: 'upsert', replaceDetails: false },
      {
        onSuccess: (result) => {
          toast.success(`Ürünler aktarıldı · ${result.summary.create} yeni, ${result.summary.update} güncellendi, ${result.summary.error} hata`);
          router.back();
        },
        onError: (error) => toast.error(`Aktarım tamamlanamadı: ${error.message}`),
      },
    );
  }

  return (
    <FormScreen
      title={`${divisionName} · Ürün İçe Aktar`}
      submitLabel={commit.isPending ? 'Aktarılıyor...' : `${validRows.length} Satırı Aktar`}
      submitting={commit.isPending}
      submitDisabled={!preview || validRows.length === 0}
      onSubmit={runCommit}
    >
      <OptionPicker
        label="Aktarım Bölümü"
        value={divisionId || null}
        options={(user?.divisions ?? []).map((division) => ({ value: division.id, label: division.name }))}
        placeholder="CNC, Sac İşleme veya Üniversal seçin"
        onChange={(next) => {
          setDivisionId(next ?? '');
          setCategoryCode('');
          setSubcategoryCode('');
          setProductTypeCode('');
          setPreview(null);
        }}
      />
      <Card className="gap-3">
        <Eyebrow>Şablonu ürün tipine göre indirin</Eyebrow>
        <OptionPicker
          label="Ürün Kategorisi"
          value={categoryCode || null}
          options={categories.map(([value, label]) => ({ value, label }))}
          placeholder={options.isFetching ? 'Yükleniyor…' : 'Kategori seçin'}
          onChange={(next) => {
            setCategoryCode(next ?? '');
            setSubcategoryCode('');
            setProductTypeCode('');
          }}
        />
        {subcategories.length ? (
          <OptionPicker
            label="Ürün Alt Kategorisi"
            value={subcategoryCode || null}
            options={subcategories.map(([value, label]) => ({ value, label }))}
            placeholder="Alt kategori seçin"
            onChange={(next) => {
              setSubcategoryCode(next ?? '');
              setProductTypeCode('');
            }}
          />
        ) : null}
        <OptionPicker
          label="Ürün Tipi"
          value={productTypeCode || null}
          options={types.map((row) => ({ value: row.productTypeCode, label: row.productTypeName, hint: `${row.productCount} ürün` }))}
          placeholder="Tip seçin"
          searchable
          onChange={(next) => setProductTypeCode(next ?? '')}
        />
        <SmallButton
          label={productTypeCode ? 'Seçili tip için şablon' : 'Şablon'}
          icon="download-outline"
          onPress={() => void downloadTemplate()}
          disabled={downloading || !divisionId}
        />
      </Card>

      <Card className="gap-3">
        <Eyebrow>Dosya</Eyebrow>
        <Text className="font-inter text-xs text-muted-foreground">
          {file ? `${file.name} · ${(file.sizeBytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB` : '.xlsx'}
        </Text>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button label="Dosya Seç" variant="ghost" onPress={() => void chooseFile()} disabled={!divisionId || commit.isPending} />
          </View>
          <View className="flex-1">
            <Button label="Ön İzle" onPress={() => void runPreview()} loading={previewImport.isPending} disabled={!file || previewImport.isPending} />
          </View>
        </View>
      </Card>

      {preview ? (
        <>
          <View className="-mx-4">
            <KpiGrid>
              {[
                <KpiTile key="total" icon="list-outline" tone="neutral" label="Satır" value={String(preview.summary.total)} />,
                <KpiTile key="create" icon="add-circle-outline" tone="success" label="Yeni" value={String(preview.summary.create)} />,
                <KpiTile key="update" icon="refresh-outline" tone="info" label="Güncelleme" value={String(preview.summary.update)} />,
                <KpiTile
                  key="error"
                  icon="alert-circle-outline"
                  tone={preview.summary.error ? 'destructive' : 'neutral'}
                  label="Hata"
                  value={String(preview.summary.error)}
                  sub={`${preview.summary.skip} atlanan`}
                />,
              ]}
            </KpiGrid>
          </View>
          <Card className="gap-0 px-3 py-1">
            {preview.rows.slice(0, 200).map((row) => {
              const status = STATUS[row.status];
              return (
                <View key={`${row.rowNumber}-${row.modelCode}`} className="gap-1 border-b border-border py-2">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>
                      {row.rowNumber}. {[row.brandName, row.modelCode].filter(Boolean).join(' · ')}
                    </Text>
                    <Chip label={status.label} tone={status.tone} />
                  </View>
                  {row.fullName ? (
                    <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                      {row.fullName}
                      {row.listPrice != null ? ` · ${formatAmount(row.listPrice, row.currencyCode ?? 'USD')}` : ''}
                    </Text>
                  ) : null}
                  {[...row.errors, ...row.warnings].map((message, index) => (
                    <Text key={index} className={`font-inter text-xs ${index < row.errors.length ? 'text-destructive' : 'text-warning'}`}>
                      {message}
                    </Text>
                  ))}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </FormScreen>
  );
}
