import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactCreateInput } from '@haksan/shared';
import { contactService } from '../../api/services';
import { Button, Card, Field, Loading, Screen, SectionTitle } from '../../ui';
import { CompanyPicker } from '../../ui/CompanyPicker';

export function ContactFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route.params?.id;
  const isEdit = !!id;
  const qc = useQueryClient();

  const existing = useQuery({ queryKey: ['contact', id], queryFn: () => contactService.get(id as string), enabled: isEdit });

  const [companyId, setCompanyId] = useState<string | null>(route.params?.companyId ?? null);
  const [companyLabel, setCompanyLabel] = useState<string | null>(route.params?.companyLabel ?? null);
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const c: any = existing.data;
    if (!c) return;
    setFullName(c.fullName ?? '');
    setTitle(c.title ?? '');
    setDepartment(c.department ?? '');
    setMobilePhone(c.mobilePhone ?? '');
    setWorkPhone(c.workPhone ?? '');
    setWorkEmail(c.workEmail ?? '');
    setNotes(c.notes ?? '');
    if (c.companyId) setCompanyId(c.companyId);
    if (c.company) setCompanyLabel(c.company.shortName || c.company.legalTitle);
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const base = {
        fullName: fullName.trim(),
        title: title.trim() || undefined,
        department: department.trim() || undefined,
        mobilePhone: mobilePhone.trim() || undefined,
        workPhone: workPhone.trim() || undefined,
        workEmail: workEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit) return contactService.update(id as string, { ...base, companyId: companyId ?? undefined });
      const body: ContactCreateInput = { ...base, companyId: companyId as string } as ContactCreateInput;
      return contactService.create(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      if (isEdit) void qc.invalidateQueries({ queryKey: ['contact', id] });
      navigation.goBack();
    },
    onError: (e: any) => Alert.alert('Kaydedilemedi', e?.message ?? 'Hata'),
  });

  const onSubmit = () => {
    if (!fullName.trim()) return Alert.alert('Ad soyad gerekli');
    if (!companyId) return Alert.alert('Firma seçin');
    save.mutate();
  };

  if (isEdit && existing.isLoading) return <Loading />;

  return (
    <Screen>
      <Card>
        <SectionTitle>{isEdit ? 'Kontağı düzenle' : 'Yeni kontak'}</SectionTitle>
        <Field label="Ad soyad *" value={fullName} onChangeText={setFullName} />
        <CompanyPicker value={companyId} valueLabel={companyLabel} onChange={(cid, lbl) => { setCompanyId(cid); setCompanyLabel(lbl); }} />
        <Field label="Ünvan" value={title} onChangeText={setTitle} />
        <Field label="Departman" value={department} onChangeText={setDepartment} />
        <Field label="Cep" value={mobilePhone} onChangeText={setMobilePhone} keyboardType="phone-pad" />
        <Field label="İş telefonu" value={workPhone} onChangeText={setWorkPhone} keyboardType="phone-pad" />
        <Field label="İş e-posta" value={workEmail} onChangeText={setWorkEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Not" value={notes} onChangeText={setNotes} multiline />
        <Button label={isEdit ? 'Kaydet' : 'Kontak oluştur'} loading={save.isPending} onPress={onSubmit} />
      </Card>
    </Screen>
  );
}
