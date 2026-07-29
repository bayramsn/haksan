import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LoadingCenter } from '@/src/ui/DetailLayout';
import {
  CompanyDetailHeaderBar,
  CompanyQuickActionFlat,
  CompanyQuickActionFlatRow,
  ContactInfoCard,
  NotesCard,
} from '@/src/ui/company/CompanyDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { TabStrip } from '@/src/ui/TabStrip';
import { colors, layout, spacing, typography, fonts } from '@/src/theme/tokens';
import { useDetailRecord } from './useDetailRecord';

const TABS = ['Genel', 'Diğer Bilgiler', 'Notlar'] as const;
type Tab = (typeof TABS)[number];

type Props = { id: string };

/** Stitch Kontak Detay */
export function ContactDetailScreen({ id }: Props) {
  const { data, loading, error } = useDetailRecord('contacts', id);
  const [tab, setTab] = useState<Tab>('Genel');

  const fullName = String(data?.fullName ?? data?.name ?? 'Kontak');
  const title = String(data?.title ?? '');
  const department = String(data?.department ?? '');
  
  const phone = String(data?.phone ?? data?.mobilePhone ?? data?.mobile ?? '');
  const mobile = String(data?.mobilePhone ?? data?.mobile ?? '');
  const email = String(data?.email ?? '');
  const companyName = String(data?.company?.name ?? data?.companyName ?? data?.firm?.name ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.firm?.id ?? '');

  const openMore = () => {
    Alert.alert('Kontak', undefined, [
      { text: 'Düzenle', onPress: () => router.push(`/forms/contact?id=${id}`) },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const dialPhone = (num: string) => {
    if (!num) return;
    void Linking.openURL(`tel:${num.replace(/\\D/g, '')}`);
  };

  const sendEmail = () => {
    if (!email) return;
    void Linking.openURL(`mailto:${email}`);
  };

  const sendWhatsApp = (num: string) => {
    if (!num) return;
    void Linking.openURL(`https://wa.me/${num.replace(/\\D/g, '')}`);
  };

  if (loading) return <LoadingCenter />;
  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.err}>{error ?? 'Kontak bulunamadı'}</Text>
      </Screen>
    );
  }

  const generalRows = [
    companyName && companyName !== 'Firma Bağlantısı Yok' ? { icon: 'business-outline' as const, label: 'Firma', value: companyName, onPress: companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined } : null,
    title ? { icon: 'person-outline' as const, label: 'Ünvan', value: title } : null,
    department ? { icon: 'briefcase-outline' as const, label: 'Departman', value: department } : null,
    phone ? { icon: 'call-outline' as const, label: 'İş Telefonu', value: phone, onPress: () => dialPhone(phone) } : null,
    mobile && mobile !== phone ? { icon: 'phone-portrait-outline' as const, label: 'Cep Telefonu', value: mobile, onPress: () => dialPhone(mobile) } : null,
    email ? { icon: 'mail-outline' as const, label: 'E-Posta', value: email, onPress: sendEmail } : null,
  ].filter(Boolean) as any;

  const otherRows = [
    data?.personalEmail ? { icon: 'mail-outline' as const, label: 'Kişisel E-Posta', value: String(data.personalEmail) } : null,
    data?.otherEmail ? { icon: 'mail-outline' as const, label: 'Diğer E-Posta', value: String(data.otherEmail) } : null,
    data?.otherPhone ? { icon: 'call-outline' as const, label: 'Diğer Telefon', value: String(data.otherPhone) } : null,
    data?.gender ? { icon: 'transgender-outline' as const, label: 'Cinsiyet', value: String(data.gender) } : null,
    data?.birthDate ? { icon: 'calendar-outline' as const, label: 'Doğum Tarihi', value: String(data.birthDate) } : null,
    data?.decisionRoleCode ? { icon: 'star-outline' as const, label: 'Karar Yetkisi', value: String(data.decisionRoleCode) } : null,
    data?.favoriteTeam ? { icon: 'football-outline' as const, label: 'Tuttuğu Takım', value: String(data.favoriteTeam) } : null,
    data?.hometown ? { icon: 'home-outline' as const, label: 'Memleketi', value: String(data.hometown) } : null,
    data?.graduatedSchool ? { icon: 'school-outline' as const, label: 'Mezun Olduğu Okul', value: String(data.graduatedSchool) } : null,
  ].filter(Boolean) as any;

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <CompanyDetailHeaderBar title={fullName} onMore={openMore} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
          </View>
          <Text style={styles.heroTitle}>{fullName}</Text>
          {title || department ? (
            <Text style={styles.heroSubtitle}>
              {title} {title && department ? '·' : ''} {department}
            </Text>
          ) : null}
          {data?.isPrimary ? (
             <View style={styles.primaryBadge}>
               <Text style={styles.primaryBadgeText}>Birincil Kontak</Text>
             </View>
          ) : null}
        </View>

        <CompanyQuickActionFlatRow>
          <CompanyQuickActionFlat label="Ara" icon="call-outline" onPress={() => dialPhone(mobile || phone)} />
          <CompanyQuickActionFlat label="WhatsApp" icon="logo-whatsapp" onPress={() => sendWhatsApp(mobile || phone)} />
          <CompanyQuickActionFlat label="E-posta" icon="mail-outline" onPress={sendEmail} />
        </CompanyQuickActionFlatRow>

        <TabStrip
          tabs={TABS.map((t) => ({ key: t, label: t }))}
          value={tab}
          onChange={setTab}
          variant="underline"
          scrollable
        />

        {tab === 'Genel' ? (
          <View style={styles.tabBody}>
            <ContactInfoCard rows={generalRows} />
          </View>
        ) : null}

        {tab === 'Diğer Bilgiler' ? (
          <View style={styles.tabBody}>
            {otherRows.length === 0 ? (
              <Text style={styles.muted}>Diğer bilgi bulunamadı</Text>
            ) : (
              <ContactInfoCard rows={otherRows} />
            )}
          </View>
        ) : null}

        {tab === 'Notlar' ? (
          <View style={styles.tabBody}>
            <NotesCard notes={String(data.note ?? data.notes ?? '')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f7f7f8' },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xxl,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: '#fff',
  },
  heroTitle: {
    ...typography.titleLg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.secondary,
    textAlign: 'center',
  },
  primaryBadge: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  primaryBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#d97706', // amber-600
  },
  tabBody: { gap: spacing.lg },
  muted: { ...typography.bodySm, color: colors.secondary },
  err: { color: colors.accentRed, padding: spacing.lg },
});
