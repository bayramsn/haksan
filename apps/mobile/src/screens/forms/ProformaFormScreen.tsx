import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { documentService, noteTemplateService, quoteService } from '@/src/api/services';
import { documentNoFromRow } from '@/src/ui/offer/offerHelpers';
import {
  foldTermsToNotes,
  notesFromTemplateBody,
  notesTemplateBody,
  notesToTerms,
  PROFORMA_NOTE_TEMPLATE_SCOPE,
} from '@/src/ui/offer/proformaNotes';
import { Select } from '@/src/ui/Select';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';

/** Stitch Yeni Proforma — `d249d514558a47149b69bc977c79f0ce` */
export function ProformaFormScreen() {
  const { quoteId: initialQuoteId } = useLocalSearchParams<{ quoteId?: string }>();
  const today = new Date().toISOString().slice(0, 10);

  const [quoteId, setQuoteId] = useState(initialQuoteId ?? '');
  const [quoteLabel, setQuoteLabel] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  // Dokunulmayan not gönderilmez; proforma bağlı teklifin şartlarıyla basılır (web ile aynı).
  const [notesDirty, setNotesDirty] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; title: string; body: string }[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  const loadTemplates = async () => {
    try {
      const rows = (await noteTemplateService.list(PROFORMA_NOTE_TEMPLATE_SCOPE)) as Record<string, unknown>[];
      setTemplates(
        (Array.isArray(rows) ? rows : [])
          .filter((t) => t.scope === PROFORMA_NOTE_TEMPLATE_SCOPE)
          .map((t) => ({ id: String(t.id), title: String(t.title ?? ''), body: String(t.body ?? '') })),
      );
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const changeNotes = (text: string) => {
    setNotes(text);
    setNotesDirty(true);
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) changeNotes(notesFromTemplateBody(template.body));
  };

  const saveTemplate = async () => {
    const title = templateTitle?.trim();
    if (!title) return;
    if (!notes.trim()) {
      Alert.alert('Hata', 'Önce not girin');
      return;
    }
    setTemplateSaving(true);
    try {
      const created = (await noteTemplateService.create({
        title,
        body: notesTemplateBody(notes),
        scope: PROFORMA_NOTE_TEMPLATE_SCOPE,
      })) as { id?: string };
      await loadTemplates();
      if (created?.id) setTemplateId(String(created.id));
      setTemplateTitle(null);
      Alert.alert('Başarılı', 'Notlar şablon olarak kaydedildi');
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Şablon kaydedilemedi');
    } finally {
      setTemplateSaving(false);
    }
  };

  useEffect(() => {
    if (!initialQuoteId) return;
    void (async () => {
      try {
        const quote = (await quoteService.get(initialQuoteId)) as Record<string, unknown>;
        setQuoteId(initialQuoteId);
        const company = quote.company as Record<string, unknown> | undefined;
        const companyName = String(company?.shortName ?? company?.legalTitle ?? '');
        setQuoteLabel(`${documentNoFromRow(quote)}${companyName ? ` · ${companyName}` : ''}`);
        setNotes(foldTermsToNotes((quote.terms as Record<string, unknown> | undefined) ?? quote));
      } catch {
        setQuoteLabel(initialQuoteId);
      }
    })();
  }, [initialQuoteId]);

  const suggestNo = () => {
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setDocumentNo(`PRF-${year}/${seq}`);
  };

  useEffect(() => {
    if (!documentNo) suggestNo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!quoteId) {
      Alert.alert('Hata', 'Bağlı teklif bulunamadı');
      return;
    }
    if (!documentNo.trim()) {
      Alert.alert('Hata', 'Proforma no zorunludur');
      return;
    }
    setLoading(true);
    try {
      const created = await documentService.createProforma({
        quoteId,
        documentNo: documentNo.trim(),
        issueDate: new Date(issueDate),
        statusCode: 'draft',
        terms: notesDirty ? notesToTerms(notes) : undefined,
      });
      const id = String((created as { id?: string }).id ?? '');
      Alert.alert('Başarılı', 'Proforma oluşturuldu', [
        id
          ? { text: 'Detay', onPress: () => router.replace(`/modules/proformas/${id}`) }
          : undefined,
        { text: 'Tamam', onPress: () => router.back() },
      ].filter(Boolean) as { text: string; onPress?: () => void }[]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Proforma oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Yeni Proforma" subtitle="Teklife bağlı proforma kaydı">
      {quoteLabel ? (
        <View style={styles.field}>
          <Text style={styles.label}>Bağlı Teklif</Text>
          <View style={styles.quoteChip}>
            <Text style={styles.quoteChipText} numberOfLines={2}>
              {quoteLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Proforma No *</Text>
        <View style={styles.inlineRow}>
          <TextInput
            value={documentNo}
            onChangeText={setDocumentNo}
            placeholder="PRF-2026/001"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
          />
          <Pressable onPress={suggestNo} style={styles.suggestBtn}>
            <Text style={styles.suggestText}>Öner</Text>
          </Pressable>
        </View>
      </View>

      <Input label="Tarih" value={issueDate} onChangeText={setIssueDate} />

      {templates.length > 0 ? (
        <Select
          label="Not Şablonu"
          value={templateId}
          onValueChange={applyTemplate}
          options={templates.map((t) => ({ label: t.title, value: t.id }))}
          placeholder="Şablon seçin..."
        />
      ) : null}

      <Input
        label="Notlar"
        value={notes}
        onChangeText={changeNotes}
        placeholder="Her satıra bir not yazın..."
        multiline
        textAlignVertical="top"
        style={styles.notesInput}
      />

      {templateTitle === null ? (
        <Button title="Notları şablon olarak kaydet" variant="ghost" onPress={() => setTemplateTitle('')} />
      ) : (
        <View style={styles.templateBox}>
          <Input label="Şablon adı" value={templateTitle} onChangeText={setTemplateTitle} maxLength={120} autoFocus />
          <View style={styles.templateActions}>
            <Button title="Vazgeç" variant="secondary" onPress={() => setTemplateTitle(null)} disabled={templateSaving} style={styles.flex} />
            <Button title="Şablonu kaydet" onPress={() => void saveTemplate()} loading={templateSaving} disabled={!templateTitle.trim()} style={styles.flex} />
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Vazgeç" variant="secondary" onPress={() => router.back()} />
        <Button title="Proforma Oluştur" onPress={() => void submit()} loading={loading} />
      </View>
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.outline, textTransform: 'uppercase' },
  quoteChip: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quoteChipText: { ...typography.bodySm, color: '#fff', fontFamily: fonts.semibold },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  suggestBtn: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestText: { ...typography.label, color: colors.primary },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  notesInput: { minHeight: 140, paddingTop: spacing.sm },
  templateBox: { gap: spacing.sm },
  templateActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
