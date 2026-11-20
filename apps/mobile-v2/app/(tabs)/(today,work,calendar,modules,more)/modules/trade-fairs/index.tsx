import { useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { tradeFairContactCreateSchema, tradeFairContactUpdateSchema } from '@haksan/shared';
import { useFairContacts, useCreateFairContact, useDeleteFairContact, useUpdateFairContact, type FairContact } from '@/src/api/field.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Button, Card, EmptyState, ErrorState, Field, ScreenHeader, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

export default function TradeFairsScreen() {
  const router = useRouter();
  const canCreate = useCan('trade_fairs.create');
  const canUpdate = useCan('trade_fairs.update');
  const canDelete = useCan('trade_fairs.delete');
  const { user } = useAuth();
  // Sunucu kuralı: yönetici değilse yalnız kendi eklediği kaydı silebilir.
  const isManager = Boolean(user?.roles?.some((role) => role === 'admin' || role === 'super_admin'));
  const canCompany = useCan('companies.create');
  const canContact = useCan('contacts.create');
  const canOpportunity = useCan('opportunities.create');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 350);
  const list = useFairContacts(debounced);
  const create = useCreateFairContact();
  const update = useUpdateFairContact();
  const remove = useDeleteFairContact();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [fairName, setFairName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [notes, setNotes] = useState('');
  const rows = list.data?.pages.flatMap(page => page.data) ?? [];
  // Fuar adı yeni kayıtlar arasında bilerek kalır (aynı fuarda art arda giriş); düzenlemeden sonra kalmaz.
  function closeForm() { if (editingId) setFairName(''); setAdding(false); setEditingId(null); setCompanyName(''); setContactName(''); setMobilePhone(''); setNotes(''); }
  function startEdit(row: FairContact) {
    setEditingId(row.id); setAdding(true);
    setFairName(row.fairName); setCompanyName(row.companyName); setContactName(row.contactName); setMobilePhone(row.mobilePhone ?? ''); setNotes(row.notes ?? '');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }
  function save() {
    const values = { fairName, companyName, contactName, mobilePhone, notes };
    if (editingId) {
      const parsed = tradeFairContactUpdateSchema.safeParse(values);
      if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.'); return; }
      update.mutate({ id: editingId, body: parsed.data }, { onSuccess: () => { closeForm(); toast.success('Görüşme güncellendi'); }, onError: error => toast.error(error.message) });
      return;
    }
    const parsed = tradeFairContactCreateSchema.safeParse(values);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.'); return; }
    create.mutate(parsed.data, { onSuccess: () => { closeForm(); toast.success('Fuar görüşmesi kaydedildi'); }, onError: error => toast.error(error.message) });
  }
  function confirmDelete(row: FairContact) {
    Alert.alert('Görüşmeyi sil', `${row.companyName} · ${row.contactName} kaydı silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => remove.mutate(row.id, { onSuccess: () => { if (row.id === editingId) closeForm(); toast.success('Görüşme silindi'); }, onError: error => toast.error(error.message) }) },
    ]);
  }
  return <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
    <ScreenHeader title="Fuar" subtitle="Sahadaki görüşmeden müşteri takibine." />
    <SearchBar value={search} onChange={setSearch} placeholder="Fuar, firma veya kişi ara" />
    <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
      {canCreate || editingId ? <Button label={adding ? 'Formu kapat' : 'Görüşme Kaydet'} variant="ghost" onPress={() => adding ? closeForm() : setAdding(true)} /> : null}
      {adding ? <Card className="gap-3">
        <Field label="Fuar adı" value={fairName} onChangeText={setFairName} maxLength={200} />
        <Field label="Firma adı" value={companyName} onChangeText={setCompanyName} maxLength={255} />
        <Field label="Yetkili adı" value={contactName} onChangeText={setContactName} maxLength={200} />
        <Field label="Telefon" value={mobilePhone} onChangeText={setMobilePhone} keyboardType="phone-pad" maxLength={32} />
        <Field label="Görüşme notu" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        <Button label={editingId ? 'Değişiklikleri Kaydet' : 'Kaydet'} onPress={save} loading={create.isPending || update.isPending} />
      </Card> : null}
      {list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Text className="text-muted-foreground">Görüşmeler yükleniyor…</Text> : null}
      {!list.isPending && !list.error && !rows.length ? <EmptyState title="Görüşme bulunamadı" hint="Fuardaki ilk görüşmenizi kaydedin veya aramayı değiştirin." /> : null}
      {rows.map(row => {
        const sourceNote = `Fuar: ${row.fairName} · Görüşme: ${row.id}\n${row.notes ?? ''}`;
        const params = { fairContactId: row.id, companyName: row.companyName, contactName: row.contactName, phone: row.mobilePhone ?? '', email: row.email ?? '', notes: sourceNote };
        return <Card key={row.id} className="gap-3">
          <Text className="font-inter-semibold text-base text-foreground">{row.companyName}</Text>
          <Text className="font-inter text-sm text-muted-foreground">{row.contactName} · {row.fairName}</Text>
          {row.notes ? <Text className="font-inter text-sm text-foreground">{row.notes}</Text> : null}
          <Text className="font-inter text-xs text-muted-foreground">Mevcut firma veya kişiyi arayarak mükerrer kayıt açılmasını önleyin. Bilgiler düzenlenebilir forma taşınır.</Text>
          {canCompany ? <Button variant="ghost" label="Firma Kaydına Aktar" onPress={() => router.push({ pathname: '/modal/new-company', params })} /> : null}
          {canContact ? <Button variant="ghost" label="Kontak Kaydına Aktar" onPress={() => router.push({ pathname: '/modal/contact', params })} /> : null}
          {canOpportunity ? <Button label="Fırsata Aktar" onPress={() => router.push({ pathname: '/modal/new-opportunity', params })} /> : null}
          {canUpdate || (canDelete && (isManager || row.createdBy === user?.id)) ? <View className="flex-row gap-2">
            {canUpdate ? <View className="flex-1"><Button variant="ghost" label="Düzenle" onPress={() => startEdit(row)} /></View> : null}
            {canDelete && (isManager || row.createdBy === user?.id) ? <View className="flex-1"><Button variant="destructive" label="Sil" onPress={() => confirmDelete(row)} /></View> : null}
          </View> : null}
        </Card>;
      })}
      {list.hasNextPage ? <Button label="Daha Fazla" variant="ghost" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
    </ScrollView>
  </SafeAreaView>;
}
