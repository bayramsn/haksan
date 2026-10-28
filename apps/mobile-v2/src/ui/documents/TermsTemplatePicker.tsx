import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useCan } from '@/src/auth/AuthProvider';
import { useDeleteNoteTemplate, useNoteTemplates, useSaveNoteTemplate } from '@/src/api/note-templates.hooks';
import { Button, Field } from '@/src/ui';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { decodeTermsTemplate, encodeTermsTemplate, type TemplateTerms } from './terms-template';

/** Webdeki aynı scope ve gövdeyle ortak şablon kütüphanesi. */
export function NoteTemplatePicker({ scope, body, onApply }: { scope: string; body: string; onApply: (body: string) => void }) {
  const canRead = useCan('quotes.read');
  const canManage = useCan('quotes.create');
  const list = useNoteTemplates(scope);
  const save = useSaveNoteTemplate();
  const remove = useDeleteNoteTemplate();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const selectedTemplate = list.data?.find((item) => item.id === selected);
  const busy = save.isPending || remove.isPending;
  if (!canRead) return null;
  function persist(update: boolean) {
    if (busy || !body.trim() || !name.trim() || (update && !selectedTemplate)) return;
    if (body.length > 12000) return toast.error('Şablon en fazla 12.000 karakter olabilir.');
    save.mutate({ id: update ? selectedTemplate?.id : undefined, body: { scope, title: name.trim(), body } }, {
      onSuccess: (row) => { setSelected(row.id); setEditingName(false); toast.success('Şablon kaydedildi'); },
      onError: (error) => toast.error(error.message),
    });
  }
  return <View className="gap-2">
    <OptionPicker label="Kayıtlı şablon" placeholder="Şablon seçin" value={selected}
      options={(list.data ?? []).map((item) => ({ value: item.id, label: item.title }))} searchable clearable disabled={busy}
      loading={list.isPending} loadError={list.error} onRetry={() => void list.refetch()}
      onChange={(id) => { setSelected(id); const row = list.data?.find((item) => item.id === id); if (row) { setName(row.title); onApply(row.body); } }} />
    {canManage ? <>
      <Button variant="ghost" label={editingName ? 'Şablon kaydını kapat' : 'Metni şablon olarak kaydet'} onPress={() => setEditingName((current) => !current)} disabled={busy} />
      {editingName ? <>
        <Field label="Şablon adı" value={name} onChangeText={setName} maxLength={200} editable={!busy} />
        <Button label="Yeni şablon kaydet" loading={save.isPending} disabled={busy || !name.trim() || !body.trim()} onPress={() => persist(false)} />
        {selectedTemplate ? <Button label="Seçili şablonu güncelle" variant="ghost" disabled={busy || !name.trim() || !body.trim()} onPress={() => persist(true)} /> : null}
      </> : null}
      {selectedTemplate ? <Button label="Seçili şablonu sil" variant="ghost" disabled={busy} onPress={() => Alert.alert('Şablon silinsin mi?', selectedTemplate.title, [
        { text: 'Vazgeç', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: () => remove.mutate(selectedTemplate.id, { onSuccess: () => { setSelected(null); toast.success('Şablon silindi'); }, onError: (error) => toast.error(error.message) }) },
      ])} /> : null}
    </> : null}
    <Text className="font-inter text-xs text-muted-foreground">Şablon metni bu kayda aktarılır; sonraki düzenlemeler kayda aittir.</Text>
  </View>;
}

export function TermsTemplatePicker({ scope, value, onApply }: { scope: 'quote_terms' | 'proforma_terms' | 'contract_terms'; value: TemplateTerms; onApply: (terms: TemplateTerms) => void }) {
  return <NoteTemplatePicker scope={scope} body={encodeTermsTemplate(value)} onApply={(body) => {
    const terms = decodeTermsTemplate(body);
    if (!terms) return toast.error('Şablonun şart biçimi geçersiz.');
    onApply(terms);
  }} />;
}
