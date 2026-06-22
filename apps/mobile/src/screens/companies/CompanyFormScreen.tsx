import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyCreateInput } from '@haksan/shared';
import { companyService } from '../../api/services';
import { Button, Card, Field, Loading, OptionGroup, Screen, SectionTitle } from '../../ui';

type RelationCode = 'customer' | 'supplier' | 'supplier_customer';
type StatusCode = 'potential' | 'active' | 'passive' | 'blacklist';

const RELATION_OPTIONS: ReadonlyArray<{ value: RelationCode; label: string }> = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'supplier_customer', label: 'Müşteri+Tedarikçi' },
];
const STATUS_OPTIONS: ReadonlyArray<{ value: StatusCode; label: string }> = [
  { value: 'potential', label: 'Potansiyel' },
  { value: 'active', label: 'Aktif' },
  { value: 'passive', label: 'Pasif' },
  { value: 'blacklist', label: 'Kara liste' },
];

export function CompanyFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route.params?.id;
  const isEdit = !!id;
  const qc = useQueryClient();

  const existing = useQuery({ queryKey: ['company', id], queryFn: () => companyService.get(id as string), enabled: isEdit });

  const [legalTitle, setLegalTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const [sector, setSector] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [relationTypeCode, setRelationTypeCode] = useState<RelationCode>('customer');
  const [customerStatusCode, setCustomerStatusCode] = useState<StatusCode>('potential');

  useEffect(() => {
    const c: any = existing.data;
    if (!c) return;
    setLegalTitle(c.legalTitle ?? '');
    setShortName(c.shortName ?? '');
    setSector(c.sector ?? '');
    setTaxOffice(c.taxOffice ?? '');
    setTaxNumber(c.taxNumber ?? '');
    setWebsite(c.website ?? '');
    setNotes(c.notes ?? '');
    if (c.relationType?.code) setRelationTypeCode(c.relationType.code);
    if (c.customerStatus?.code) setCustomerStatusCode(c.customerStatus.code);
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const base = {
        legalTitle: legalTitle.trim(),
        shortName: shortName.trim() || undefined,
        sector: sector.trim() || undefined,
        taxOffice: taxOffice.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
        relationTypeCode,
        customerStatusCode,
      };
      if (isEdit) return companyService.update(id as string, base);
      const body: CompanyCreateInput = {
        ...base,
        companyType: 'company',
        primaryPhone: primaryPhone.trim() || undefined,
        primaryEmail: primaryEmail.trim() || undefined,
      } as CompanyCreateInput;
      return companyService.create(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      if (isEdit) void qc.invalidateQueries({ queryKey: ['company', id] });
      navigation.goBack();
    },
    onError: (e: any) => Alert.alert('Kaydedilemedi', e?.message ?? 'Hata'),
  });

  const onSubmit = () => {
    if (!legalTitle.trim()) return Alert.alert('Ünvan gerekli');
    save.mutate();
  };

  if (isEdit && existing.isLoading) return <Loading />;

  return (
    <Screen>
      <Card>
        <SectionTitle>{isEdit ? 'Firmayı düzenle' : 'Yeni firma'}</SectionTitle>
        <Field label="Ünvan *" value={legalTitle} onChangeText={setLegalTitle} placeholder="Resmi ünvan" />
        <Field label="Kısa ad" value={shortName} onChangeText={setShortName} />
        <OptionGroup label="İlişki" value={relationTypeCode} options={RELATION_OPTIONS} onChange={setRelationTypeCode} />
        <OptionGroup label="Durum" value={customerStatusCode} options={STATUS_OPTIONS} onChange={setCustomerStatusCode} />
        <Field label="Sektör" value={sector} onChangeText={setSector} />
        <Field label="Vergi dairesi" value={taxOffice} onChangeText={setTaxOffice} />
        <Field label="Vergi no" value={taxNumber} onChangeText={setTaxNumber} keyboardType="number-pad" />
        <Field label="Web" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />
        {!isEdit ? (
          <>
            <Field label="Telefon" value={primaryPhone} onChangeText={setPrimaryPhone} keyboardType="phone-pad" />
            <Field label="E-posta" value={primaryEmail} onChangeText={setPrimaryEmail} autoCapitalize="none" keyboardType="email-address" />
          </>
        ) : null}
        <Field label="Not" value={notes} onChangeText={setNotes} multiline />
        <Button label={isEdit ? 'Kaydet' : 'Firma oluştur'} loading={save.isPending} onPress={onSubmit} />
      </Card>
    </Screen>
  );
}
