import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { contactService } from '@/src/api/services';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { Select } from '@/src/ui/Select';
import { SwitchRow } from '@/src/ui/SwitchRow';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, spacing } from '@/src/theme/tokens';
import { View } from 'react-native';

const DECISION_ROLES = [
  { label: 'Belirtilmedi', value: 'none' },
  { label: 'Karar Verici', value: 'owner' },
  { label: 'Karar Verici Yardımcısı', value: 'influencer' },
];

const GENDERS = [
  { label: 'Belirtilmedi', value: 'none' },
  { label: 'Kadın', value: 'Kadın' },
  { label: 'Erkek', value: 'Erkek' },
  { label: 'Diğer', value: 'Diğer' },
];

export function ContactFormScreen() {
  const { id, companyId: initialCompanyId } = useLocalSearchParams<{ id?: string; companyId?: string }>();
  const isEdit = Boolean(id);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [companyName, setCompanyName] = useState('');
  
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [decisionRoleCode, setDecisionRoleCode] = useState('none');
  
  const [phone, setPhone] = useState('');
  const [phoneExtension, setPhoneExtension] = useState('');
  const [mobile, setMobile] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  
  const [email, setEmail] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [otherEmail, setOtherEmail] = useState('');
  
  const [gender, setGender] = useState('none');
  const [birthDate, setBirthDate] = useState('');
  const [favoriteTeam, setFavoriteTeam] = useState('');
  const [hometown, setHometown] = useState('');
  const [favoriteColor, setFavoriteColor] = useState('');
  const [graduatedSchool, setGraduatedSchool] = useState('');
  
  const [note, setNote] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    void contactService
      .get(id)
      .then((c) => {
        setFullName(String(c.fullName ?? c.name ?? ''));
        setTitle(String(c.title ?? ''));
        setDepartment(String(c.department ?? ''));
        setDecisionRoleCode(String(c.decisionRoleCode || 'none'));
        
        setPhone(String(c.workPhone ?? c.phone ?? ''));
        setPhoneExtension(String(c.phoneExtension ?? ''));
        setMobile(String(c.mobilePhone ?? c.mobile ?? ''));
        setOtherPhone(String(c.otherPhone ?? ''));

        setEmail(String(c.workEmail ?? c.email ?? ''));
        setPersonalEmail(String(c.personalEmail ?? ''));
        setOtherEmail(String(c.otherEmail ?? ''));
        
        setGender(String(c.gender || 'none'));
        setBirthDate(String(c.birthDate ?? ''));
        setFavoriteTeam(String(c.favoriteTeam ?? ''));
        setHometown(String(c.hometown ?? ''));
        setFavoriteColor(String(c.favoriteColor ?? ''));
        setGraduatedSchool(String(c.graduatedSchool ?? ''));
        
        setNote(String(c.note ?? c.notes ?? ''));
        setIsPrimary(Boolean(c.isPrimary));
        setIsBlacklisted(Boolean(c.isBlacklisted));
        setBlacklistReason(String(c.blacklistReason ?? ''));
        
        setCompanyId(String(c.companyId ?? initialCompanyId ?? ''));
        setCompanyName(String(c.companyName ?? c.company?.legalTitle ?? ''));
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Kontak yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id, initialCompanyId]);

  const submit = async () => {
    if (!companyId && !isEdit) {
      Alert.alert('Hata', 'Firma seçimi zorunlu');
      return;
    }
    if (!fullName.trim()) {
      Alert.alert('Hata', 'Ad soyad zorunlu');
      return;
    }
    setLoading(true);
    try {
      const body = {
        companyId,
        fullName: fullName.trim(),
        title: title.trim(),
        department: department.trim(),
        decisionRoleCode: decisionRoleCode === 'none' ? '' : decisionRoleCode,

        workPhone: phone.trim(),
        phoneExtension: phoneExtension.trim(),
        mobilePhone: mobile.trim(),
        otherPhone: otherPhone.trim(),

        workEmail: email.trim(),
        personalEmail: personalEmail.trim(),
        otherEmail: otherEmail.trim(),

        gender: gender === 'none' ? '' : gender,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        favoriteTeam: favoriteTeam.trim(),
        hometown: hometown.trim(),
        favoriteColor: favoriteColor.trim(),
        graduatedSchool: graduatedSchool.trim(),

        notes: note.trim(),
        isPrimary,
        isBlacklisted,
        blacklistReason: isBlacklisted ? blacklistReason.trim() : '',
      };
      
      if (isEdit && id) {
        await contactService.update(id, body);
        Alert.alert('Başarılı', 'Kontak güncellendi', [{ text: 'Tamam', onPress: () => router.back() }]);
      } else {
        const contact = await contactService.create(body);
        Alert.alert('Başarılı', 'Kontak oluşturuldu', [
          { text: 'Detay', onPress: () => router.replace(`/modules/contacts/${contact.id}`) },
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  if (booting) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FormPageLayout title={isEdit ? 'Kontak Düzenle' : 'Yeni Kontak'}>
      <SectionTitle title="Kurumsal Bilgiler" />
      <CompanyPicker
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.legalTitle ?? c.shortName ?? c.id));
        }}
      />
      
      <Input label="Ad Soyad *" value={fullName} onChangeText={setFullName} />
      <Input label="Ünvan" value={title} onChangeText={setTitle} />
      <Input label="Departman" value={department} onChangeText={setDepartment} />
      <Select
        label="Karar Yetkisi"
        value={decisionRoleCode}
        onValueChange={setDecisionRoleCode}
        options={DECISION_ROLES}
      />
      
      <View style={{ height: spacing.lg }} />
      <SectionTitle title="İletişim Bilgileri" />
      
      <Input label="İş Telefonu" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Dahili Numarası" value={phoneExtension} onChangeText={setPhoneExtension} keyboardType="number-pad" placeholder="Örn: 112" />
      <Input label="Cep Telefonu" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
      <Input label="Diğer Telefon" value={otherPhone} onChangeText={setOtherPhone} keyboardType="phone-pad" />
      
      <Input label="İş E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Kişisel E-posta" value={personalEmail} onChangeText={setPersonalEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Diğer E-posta" value={otherEmail} onChangeText={setOtherEmail} autoCapitalize="none" keyboardType="email-address" />
      
      <View style={{ height: spacing.lg }} />
      <SectionTitle title="Kişisel Bilgiler" />
      
      <Select
        label="Cinsiyet"
        value={gender}
        onValueChange={setGender}
        options={GENDERS}
      />
      <Input label="Doğum Tarihi" value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" />
      <Input label="Tuttuğu Takım" value={favoriteTeam} onChangeText={setFavoriteTeam} />
      <Input label="Memleketi" value={hometown} onChangeText={setHometown} />
      <Input label="Sevdiği Renk" value={favoriteColor} onChangeText={setFavoriteColor} />
      <Input label="Mezun Olduğu Okul" value={graduatedSchool} onChangeText={setGraduatedSchool} />
      
      <View style={{ height: spacing.lg }} />
      <SectionTitle title="Ek Bilgiler" />
      
      <Input label="Notlar" value={note} onChangeText={setNote} multiline />
      <SwitchRow label="Birincil Kontak" value={isPrimary} onValueChange={setIsPrimary} />
      <SwitchRow label="Kara Listeye Al" value={isBlacklisted} onValueChange={setIsBlacklisted} />
      
      {isBlacklisted && (
        <Input label="Kara Liste Sebebi" value={blacklistReason} onChangeText={setBlacklistReason} multiline />
      )}
      
      <View style={{ height: spacing.xl }} />
      <Button title={isEdit ? 'Güncelle' : 'Kaydet'} onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}
