import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useOpportunity, useUpdateOpportunity } from '@/src/api/crm.hooks';
import { useLinkOpportunityCompany } from '@/src/api/sales.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, ErrorState, Loading } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';

/** Süreç kontrol listesinin firma / mevcut kontak bağlama ekranı. */
export default function OpportunityRelationsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const canUpdate = useCan('opportunities.update');
  const canCreateContact = useCan('contacts.create');
  const query = useOpportunity(id);
  const linkCompany = useLinkOpportunityCompany();
  const update = useUpdateOpportunity();
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const initialized = useRef<string | null>(null);
  const busy = linkCompany.isPending || update.isPending;
  const submitting = useRef(false);

  useEffect(() => {
    const data = query.data;
    if (!data || initialized.current === data.id) return;
    initialized.current = data.id;
    setCompany(data.company ? { id: data.company.id, name: data.company.shortName || data.company.legalTitle } : null);
    setContact(data.primaryContact ? { id: data.primaryContact.id, name: data.primaryContact.fullName } : null);
  }, [query.data]);

  if (!canUpdate || !id) return <Redirect href={'/modules/opportunities' as Href} />;

  async function save() {
    if (!company || !query.data || submitting.current) return;
    submitting.current = true;
    try {
      if (company.id !== query.data.companyId) {
        // Yeni kişi üretmeyin: bu ekran CRM'deki seçili kişinin bağlanmasını sağlar.
        await linkCompany.mutateAsync({ id, companyId: company.id, createContact: false });
      }
      await update.mutateAsync({ id, primaryContactId: contact?.id ?? null });
      toast.success('Firma ve kontak bağlantısı kaydedildi');
      router.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bağlantılar kaydedilemedi.');
    } finally {
      submitting.current = false;
    }
  }

  return <ModalForm title="Firma ve kontak bağla" submitLabel="Bağlantıları kaydet" loading={busy} disabled={!company || query.isPending || Boolean(query.error)} onSubmit={() => void save()}>
    {query.isPending ? <Loading /> : query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : <View className="gap-4">
      <Text className="font-inter text-sm text-muted-foreground">{query.data?.title} fırsatına bağlı firma ve ilgili kişiyi seçin. Kontaklar seçilen firmaya göre listelenir.</Text>
      <CompanyPicker label="Firma *" value={company} clearable={false} disabled={busy}
        onChange={(next) => { if (next?.id !== company?.id) setContact(null); setCompany(next); }} />
      {!busy ? <ContactPicker label="İlgili kontak" companyId={company?.id ?? null} value={contact} onChange={setContact} /> : null}
      {canCreateContact && company && company.id === query.data?.companyId ? <View className="gap-1">
        <Button label="Yeni kontak oluştur" variant="ghost" disabled={busy} onPress={() => router.push({ pathname: '/modal/contact', params: { companyId: company.id, companyName: company.name } } as unknown as Href)} />
        <Text className="font-inter text-xs text-muted-foreground">Oluşturduktan sonra bu ekrana dönüp kişiyi seçerek fırsata bağlayın.</Text>
      </View> : null}
    </View>}
  </ModalForm>;
}
