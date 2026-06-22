import React, { useLayoutEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contactService } from '../../api/services';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, EmptyState, Loading, Muted, Screen, SectionTitle, colors } from '../../ui';

export function ContactDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('contacts.update');

  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => contactService.get(id) });
  const companies = useQuery({ queryKey: ['contact-companies', id], queryFn: () => contactService.companies(id), retry: false });

  const remove = useMutation({
    mutationFn: () => contactService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      navigation.goBack();
    },
    onError: (e: any) => Alert.alert('Silinemedi', e?.message ?? 'Hata'),
  });

  useLayoutEffect(() => {
    if (!canWrite) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('ContactForm', { id })} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Düzenle</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, id, canWrite]);

  if (contact.isLoading) return <Loading />;
  if (contact.isError || !contact.data)
    return <Screen><EmptyState title="Kontak yüklenemedi" subtitle={(contact.error as Error)?.message} /></Screen>;
  const c: any = contact.data;

  const confirmDelete = () =>
    Alert.alert('Kontağı sil', `${c.fullName} silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <Screen refreshing={contact.isRefetching} onRefresh={() => contact.refetch()}>
      <Card>
        <Text style={st.title}>{c.fullName}</Text>
        {c.title || c.department ? <Muted>{[c.title, c.department].filter(Boolean).join(' · ')}</Muted> : null}
        {c.isBlacklisted ? <Badge label="Kara liste" tone="danger" /> : null}
      </Card>

      <Card>
        <SectionTitle>İletişim</SectionTitle>
        <InfoRow label="Cep" value={c.mobilePhone} />
        <InfoRow label="İş telefonu" value={c.workPhone} />
        <InfoRow label="İş e-posta" value={c.workEmail} />
        <InfoRow label="Kişisel e-posta" value={c.personalEmail} />
        {c.notes ? <InfoRow label="Not" value={c.notes} /> : null}
      </Card>

      {companies.data?.length ? (
        <Card>
          <SectionTitle>Bağlı firmalar</SectionTitle>
          {companies.data.map((co) => (
            <View key={co.id} style={st.infoRow}>
              <Text style={st.infoValue}>{co.shortName || co.legalTitle}</Text>
              {co.isPrimary ? <Badge label="Birincil" tone="accent" /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {canWrite ? <Button label="Kontağı sil" variant="danger" onPress={confirmDelete} loading={remove.isPending} /> : null}
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  infoLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  infoValue: { color: colors.text, fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
