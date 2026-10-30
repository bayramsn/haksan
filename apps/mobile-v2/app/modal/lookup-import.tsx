import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { adminApi, type LookupWriteBody } from '@/src/api/admin.api';
import { adminKeys, useLookupRows } from '@/src/api/admin.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button, Card, Field } from '@/src/ui';
import { shareTextFile } from '@/src/ui/sales/shareText';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, Notice } from '@/src/ui/admin/controls';
import {
  LOOKUP_CSV_MAX_BYTES,
  parseLookupCsv,
  previewLookupCsv,
  type LookupCsvDraft,
  type LookupImportContext,
} from '@/src/ui/admin/lookup-import';
import { DIVISION_SCOPED_LOOKUPS, LOOKUP_PARENTS, SPEC_GROUP_LOOKUP, lookupLabel, lookupTemplateCsv } from '@/src/ui/admin/lookup-meta';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

export default function LookupImportModal() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ name: string; divisionId?: string; parentId?: string }>();
  const name = params.name ?? '';
  const divisionId = params.divisionId ?? '';
  const { user } = useAuth();
  const access = useAdminAccess();
  const divisions = useMemo(() => user?.divisions ?? [], [user?.divisions]);
  const parent = LOOKUP_PARENTS[name];
  const isSpecGroup = name === SPEC_GROUP_LOOKUP;
  const query = { divisionId };

  const existing = useLookupRows(name, query, access.isSuperAdmin);
  const parents = useLookupRows(parent?.lookup ?? '', query, access.isSuperAdmin && Boolean(parent));
  const types = useLookupRows('product-types', query, access.isSuperAdmin && isSpecGroup);
  const loading = existing.isPending || (Boolean(parent) && parents.isPending) || (isSpecGroup && types.isPending);
  const loadError = existing.error ?? (parent ? parents.error : null) ?? (isSpecGroup ? types.error : null);

  const context = useMemo<LookupImportContext | null>(
    () =>
      loading || loadError
        ? null
        : {
            divisionId,
            divisions,
            scoped: DIVISION_SCOPED_LOOKUPS.has(name),
            existing: existing.data ?? [],
            parents: parents.data ?? [],
            productTypes: types.data ?? [],
            parentField: parent?.field,
            defaultParentId: params.parentId || undefined,
            isSpecGroup,
          },
    [loading, loadError, divisionId, divisions, name, existing.data, parents.data, types.data, parent?.field, params.parentId, isSpecGroup]
  );

  const [drafts, setDrafts] = useState<LookupCsvDraft[]>([]);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => (context ? previewLookupCsv(drafts, context) : []), [drafts, context]);
  const ready = preview.filter((row) => row.action !== 'skip' && !row.errors.length);
  const invalid = preview.filter((row) => row.action !== 'skip' && row.errors.length);
  const divisionName = divisions.find((d) => d.id === divisionId)?.name;

  const patch = (rowNumber: number, next: Partial<LookupCsvDraft>) => {
    setDrafts((rows) => rows.map((row) => (row.row === rowNumber ? { ...row, ...next } : row)));
    setRowErrors((current) => {
      const copy = { ...current };
      delete copy[rowNumber];
      return copy;
    });
  };

  const selectFile = async () => {
    setError('');
    setDrafts([]);
    setRowErrors({});
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!/\.csv$/i.test(asset.name) || (asset.size ?? 0) > LOOKUP_CSV_MAX_BYTES) {
        setError('En fazla 5 MB boyutunda CSV dosyası seçin.');
        return;
      }
      const text = await LegacyFileSystem.readAsStringAsync(asset.uri, { encoding: LegacyFileSystem.EncodingType.UTF8 });
      setDrafts(parseLookupCsv(text));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dosya okunamadı.');
    }
  };

  const downloadTemplate = async () => {
    try {
      await shareTextFile({
        fileName: `${name}-${divisions.find((item) => item.id === divisionId)?.code ?? 'ortak'}-sablon.csv`,
        content: lookupTemplateCsv(parent, isSpecGroup),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        title: 'Şablon indir',
      });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Şablon oluşturulamadı.');
    }
  };

  const commit = async () => {
    if (!context || !ready.length || invalid.length) return;
    setSaving(true);
    setRowErrors({});
    const succeeded = new Set<number>();
    const failures: Record<number, string> = {};
    let created = 0;
    let updated = 0;
    for (const row of ready) {
      const body = row.body as LookupWriteBody & { name: string };
      try {
        if (row.action === 'update' && row.existingId) {
          await adminApi.updateLookup(name, row.existingId, body);
          updated++;
        } else {
          await adminApi.createLookup(name, body);
          created++;
        }
        succeeded.add(row.draft.row);
      } catch (reason) {
        failures[row.draft.row] = reason instanceof Error ? reason.message : 'Kayıt başarısız oldu.';
      }
    }
    setDrafts((rows) => rows.map((row) => (succeeded.has(row.row) ? { ...row, skip: true } : row)));
    setRowErrors(failures);
    setSaving(false);
    void qc.invalidateQueries({ queryKey: adminKeys.lookupsOf(name) });
    void qc.invalidateQueries({ queryKey: adminKeys.audit(`lookup:${name}`) });
    if (Object.keys(failures).length) {
      setError(`${created} yeni, ${updated} güncellenen kayıt. Hatalı satırları düzeltip yeniden deneyin; başarılı satırlar tekrar işlenmez.`);
    } else {
      toast.success(`Alan listesi aktarıldı. ${created} yeni kayıt, ${updated} güncelleme.`);
      router.back();
    }
  };

  return (
    <ModalShell
      title={`${lookupLabel(name)} — İçe aktar`}
      allowed={access.isSuperAdmin}
      loading={loading}
      error={loadError ? loadError.message || 'Mevcut kayıtlar yüklenemedi.' : null}
      onRetry={() => {
        void existing.refetch();
        if (parent) void parents.refetch();
        if (isSpecGroup) void types.refetch();
      }}
      description={`${divisionName ?? 'Ortak alanlar'} kapsamına aktarılır. Sistem kodu veya ad eşleşirse mevcut kayıt güncellenir. Satırları kaydetmeden önce düzenleyebilirsiniz.`}
    >
      <View className="flex-row flex-wrap gap-2">
        <ActionPill icon="document-outline" label="CSV dosyası" disabled={saving} onPress={() => void selectFile()} />
        <ActionPill icon="download-outline" label="Şablon indir" onPress={() => void downloadTemplate()} />
      </View>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {preview.length > 0 ? (
        <Help>
          {ready.filter((row) => row.action === 'create').length} yeni · {ready.filter((row) => row.action === 'update').length} güncelleme ·{' '}
          {invalid.length} hatalı · {preview.filter((row) => row.action === 'skip').length} atlanacak
        </Help>
      ) : null}
      {preview.map((row) => {
        const problems = [...row.errors, rowErrors[row.draft.row]].filter(Boolean).join(' ');
        return (
          <Card key={row.draft.row} className="gap-2 p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-[13px] text-foreground">Satır {row.draft.row}</Text>
              <Text className={`font-inter-medium text-[12px] ${problems ? 'text-destructive' : 'text-success'}`}>
                {problems ? 'Hatalı' : row.action === 'skip' ? 'Atlanacak' : 'Hazır'}
              </Text>
            </View>
            <ChipSelect
              options={[
                { value: 'include', label: row.existingId ? 'Güncelle' : 'Yeni kayıt' },
                { value: 'skip', label: 'Atla' },
              ]}
              value={row.draft.skip ? 'skip' : 'include'}
              onChange={(value) => patch(row.draft.row, { skip: value === 'skip' })}
              disabled={saving}
            />
            <Field label="Ad" value={row.draft.name} editable={!saving} onChangeText={(value) => patch(row.draft.row, { name: value })} />
            <Field label="Sistem kodu" value={row.draft.code} editable={!saving} autoCapitalize="characters" onChangeText={(value) => patch(row.draft.row, { code: value })} />
            <Field
              label="Bölüm"
              value={row.draft.division}
              placeholder={divisionName}
              editable={!saving}
              onChangeText={(value) => patch(row.draft.row, { division: value })}
            />
            {parent ? (
              <Field
                label={parent.label}
                value={row.draft.parent ?? ''}
                placeholder="Ad veya sistem kodu"
                editable={!saving}
                onChangeText={(value) => patch(row.draft.row, { parent: value })}
              />
            ) : null}
            {isSpecGroup ? (
              <Field
                label="Ürün tipleri"
                value={row.draft.types ?? ''}
                placeholder="Virgülle ayırın"
                editable={!saving}
                onChangeText={(value) => patch(row.draft.row, { types: value })}
              />
            ) : null}
            {problems ? <Text className="font-inter text-[12px] text-destructive">{problems}</Text> : null}
          </Card>
        );
      })}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Vazgeç" variant="ghost" disabled={saving} onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button
            label={saving ? 'Kaydediliyor…' : `${ready.length} kaydı uygula`}
            loading={saving}
            disabled={!ready.length || invalid.length > 0}
            onPress={() => void commit()}
          />
        </View>
      </View>
    </ModalShell>
  );
}
