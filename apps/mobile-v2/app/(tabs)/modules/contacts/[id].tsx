import { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActivityList, useContact, useContactList, useDeleteContact, useLookup } from '@/src/api/crm.hooks';
import { toast } from '@/src/ui/toast';
import { useContactCompanyLink } from '@/src/api/crm-general.hooks';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/src/lib/format';
import { Avatar } from '@/src/ui/Avatar';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, ListRow, Loading, SCREEN_PAD } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';

type ContactTab = 'iletisim' | 'genel' | 'notlar' | 'aktiviteler';

const GENDER_LABELS: Record<string, string> = { male: 'Erkek', female: 'Kadın' };

const CONTACT_TABS: { value: ContactTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'iletisim', label: 'İletişim', icon: 'call-outline' },
  { value: 'genel', label: 'Genel', icon: 'person-outline' },
  { value: 'notlar', label: 'Notlar', icon: 'document-text-outline' },
  { value: 'aktiviteler', label: 'Aktivite', icon: 'pulse-outline' },
];

function ContactQuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      className="h-[46px] flex-1 flex-row items-center justify-center gap-1.5 rounded-[12px] border border-border bg-card px-2 active:opacity-70"
      style={[{ borderCurve: 'continuous' }, !onPress ? { opacity: 0.4 } : null]}
    >
      <Ionicons name={icon} size={18} color={onPress ? colors.primary : colors.mutedForeground} />
      <Text className="font-inter-medium text-[12px] text-foreground" numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function ContactTabs({ value, onChange, activityCount }: { value: ContactTab; onChange: (value: ContactTab) => void; activityCount: number }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: SCREEN_PAD }}>
      {CONTACT_TABS.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            className={`h-[46px] flex-row items-center gap-2 rounded-[12px] border px-4 active:opacity-70 ${
              selected ? 'border-primary bg-primary' : 'border-border bg-card'
            }`}
            style={{ borderCurve: 'continuous' }}
          >
            <Ionicons name={item.icon} size={17} color={selected ? colors.primaryForeground : colors.mutedForeground} />
            <Text className={`font-inter-medium text-[13px] ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{item.label}</Text>
            {item.value === 'aktiviteler' && activityCount > 0 ? (
              <View className={`min-w-[18px] items-center rounded-full px-1 ${selected ? 'bg-white/20' : 'bg-secondary'}`}>
                <Text className={`font-inter-semibold text-[10px] ${selected ? 'text-primary-foreground' : 'text-primary'}`}>{activityCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<ContactTab>('iletisim');
  const { data, isPending, error, refetch } = useContact(id);
  const canUpdate = useCan('contacts.update');
  const canDelete = useCan('contacts.delete');
  const remove = useDeleteContact();

  // `GET /contacts/:id` join yapmıyor: karar rolü yalnızca id, adı lookup'tan çözülüyor.
  const decisionRoles = useLookup('decision-roles', Boolean(data?.decisionRoleId));
  // Sunucu tarafı contact filtresi sayesinde sonuç, firmanın yüklenen ilk
  // sayfasına bağlı değildir; tüm kontak geçmişi sayfalanır.
  const activities = useActivityList({ contactId: data?.id }, Boolean(data?.id));
  const siblings = useContactList({ companyId: data?.companyId ?? undefined, sortBy: 'name', sortDir: 'asc' }, Boolean(data?.companyId));
  const [refreshing, setRefreshing] = useState(false);
  const companyLink = useContactCompanyLink();

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), activities.refetch(), siblings.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kontak" />
        {isPending ? <Loading /> : <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />}
      </SafeAreaView>
    );
  }

  const decisionRole = decisionRoles.data?.find((row) => row.id === data.decisionRoleId) ?? null;
  const phone = data.mobilePhone ?? data.workPhone;
  const email = data.workEmail ?? data.personalEmail;
  const contactActivities = activities.data?.items ?? [];
  const otherContacts = (siblings.data?.items ?? []).filter((item) => item.id !== data.id);
  const primaryCompany = data.companyLinks.find((item) => item.isPrimary) ?? data.companyLinks[0] ?? null;

  function confirmDelete(contactId: string, fullName: string) {
    Alert.alert(
      'Kontağı sil?',
      `${fullName}\n\n${primaryCompany?.legalTitle ?? 'Firma bağlantısı yok'} kişisi kalıcı olarak silinir. Aktivite, teklif veya servis ilişkisi varsa sistem işlemi güvenli biçimde engelleyebilir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            remove.mutate(contactId, {
              onSuccess: () => {
                toast.success('Kontak silindi');
                router.replace('/(tabs)/modules/contacts');
              },
              onError: (deleteError) => toast.error(`Kontak silinemedi · ${deleteError.message || 'API isteği başarısız oldu.'}`),
            });
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title="Kontak"
        subtitle={data.externalContactNo ?? undefined}
        actions={
          canUpdate
            ? [{ icon: 'create-outline', label: 'Kontağı düzenle', onPress: () => router.push(`/modal/contact?id=${data.id}`) }]
            : []
        }
      />

      <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3 pt-3">
        <Card className="gap-4">
          <View className="flex-row items-center gap-3.5">
            <Avatar name={data.fullName} size={68} />
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="text-[20px] font-inter-bold leading-[25px] text-foreground" numberOfLines={2}>{data.fullName}</Text>
              {data.title || data.department ? (
                <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={2}>
                  {[data.title, data.department].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap gap-1.5 pt-0.5">
                {data.isPrimary ? <Chip tone="success" label="Birincil kontak" /> : null}
                {data.isBlacklisted ? <Chip tone="destructive" label="Kara liste" /> : null}
                {decisionRole ? <Chip tone="info" label={decisionRole.name} /> : null}
              </View>
            </View>
          </View>

          <View className="flex-row gap-2">
            <ContactQuickAction icon="call-outline" label="Ara" onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
            <ContactQuickAction icon="mail-outline" label="E-posta" onPress={
                email
                  ? () =>
                      router.push(
                        mailComposeHref({ to: email, name: data.fullName, companyId: data.companyId ?? undefined, contactId: data.id }) as Href,
                      )
                  : undefined
              }
            />
            <ContactQuickAction
              icon="business-outline"
              label="Firma"
              onPress={data.companyId ? () => router.push(`/(tabs)/modules/companies/${data.companyId}`) : undefined}
            />
            <ContactQuickAction
              icon="create-outline"
              label="Düzenle"
              onPress={canUpdate ? () => router.push(`/modal/contact?id=${data.id}`) : undefined}
            />
          </View>
        </Card>
      </View>

      <View className="pt-3">
        <ContactTabs
          value={tab}
          onChange={setTab}
          activityCount={activities.data?.total ?? contactActivities.length}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 16, paddingHorizontal: SCREEN_PAD, paddingBottom: 40, paddingTop: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {tab === 'iletisim' ? (
          <Card>
            <InfoRows
              items={[
                { label: 'Cep', value: data.mobilePhone },
                { label: 'İş telefonu', value: data.phoneExtension ? `${data.workPhone} (dahili ${data.phoneExtension})` : data.workPhone },
                { label: 'Diğer telefon', value: data.otherPhone },
                { label: 'İş e-postası', value: data.workEmail },
                { label: 'Kişisel e-posta', value: data.personalEmail },
                { label: 'Diğer e-posta', value: data.otherEmail },
              ]}
            />
          </Card>
        ) : null}

        {tab === 'genel' ? (
          <>
            <Card>
              <InfoRows
                items={[
                  { label: 'Departman', value: data.department },
                  { label: 'Unvan', value: data.title },
                  { label: 'Karar rolü', value: decisionRole?.name },
                  { label: 'Cinsiyet', value: data.gender ? (GENDER_LABELS[data.gender] ?? data.gender) : null },
                  { label: 'Doğum tarihi', value: data.birthDate ? formatDate(data.birthDate) : null },
                  { label: 'Memleket', value: data.hometown },
                  { label: 'Mezun olduğu okul', value: data.graduatedSchool },
                  { label: 'Sevdiği takım', value: data.favoriteTeam },
                  { label: 'Sevdiği renk', value: data.favoriteColor },
                  { label: 'Kayıt', value: formatDate(data.createdAt) },
                  { label: 'Oluşturan', value: data.createdByUser?.fullName || data.createdByUser?.email || null },
                ]}
              />
            </Card>

            {data.companyLinks?.length ? (
              <View className="gap-1.5">
                <View className="px-1">
                  <Eyebrow>Bağlı Firmalar ({data.companyLinks.length})</Eyebrow>
                </View>
                {data.companyLinks.map((company) => (
                  <View key={company.id} className="gap-1">
                    <ListRow
                      title={company.legalTitle}
                      lines={[company.city]}
                      icon="business-outline"
                      iconTone="info"
                      chip={company.isPrimary ? { label: 'Birincil', tone: 'success' } : undefined}
                      onPress={() => router.push(`/(tabs)/modules/companies/${company.id}`)}
                    />
                    {canUpdate && data.companyLinks.length > 1 ? (
                      <View className="flex-row justify-end gap-2">
                        {!company.isPrimary ? (
                          <Button
                            label="Birincil yap"
                            variant="ghost"
                            disabled={companyLink.isPending}
                            onPress={() =>
                              companyLink.mutate(
                                { id: data.id, companyId: company.id, action: 'primary' },
                                {
                                  onSuccess: () => toast.success('Birincil firma güncellendi'),
                                  onError: (err) => toast.error(`Güncellenemedi · ${err.message || 'İşlem başarısız.'}`),
                                },
                              )
                            }
                          />
                        ) : null}
                        <Button
                          label="Firmadan ayır"
                          variant="destructive"
                          disabled={companyLink.isPending}
                          onPress={() =>
                            Alert.alert('Firmadan ayır', `${data.fullName} ile ${company.legalTitle} arasındaki bağ kaldırılsın mı?`, [
                              { text: 'Vazgeç', style: 'cancel' },
                              {
                                text: 'Ayır',
                                style: 'destructive',
                                onPress: () =>
                                  companyLink.mutate(
                                    { id: data.id, companyId: company.id, action: 'unlink' },
                                    {
                                      onSuccess: () => toast.success('Firma bağı kaldırıldı'),
                                      onError: (err) => toast.error(`Kaldırılamadı · ${err.message || 'İşlem başarısız.'}`),
                                    },
                                  ),
                              },
                            ])
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
                {canUpdate ? (
                  <Text className="px-1 font-inter text-[11px] text-muted-foreground">
                    Aynı kişi birden çok firmada yetkili olabilir. "Birincil yap" ile varsayılan firmayı değiştir, "Firmadan ayır" ile bağı kaldır.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {data.companyId ? (
              <View className="gap-1.5">
                <View className="px-1">
                  <Eyebrow>Aynı firmadaki diğer kontaklar ({otherContacts.length})</Eyebrow>
                </View>
                {siblings.isPending ? (
                  <Loading />
                ) : otherContacts.length === 0 ? (
                  <Card>
                    <Text className="text-center font-inter text-sm text-muted-foreground">Bu firmada başka kontak yok.</Text>
                  </Card>
                ) : (
                  otherContacts.slice(0, 10).map((contact) => (
                    <ListRow
                      key={contact.id}
                      title={contact.fullName}
                      lines={[[contact.title, contact.department].filter(Boolean).join(' · ') || null, contact.mobilePhone ?? contact.workPhone]}
                      icon="person-outline"
                      iconTone={contact.isPrimary ? 'success' : 'neutral'}
                      chip={contact.isPrimary ? { label: 'Birincil', tone: 'success' } : undefined}
                      onPress={() => router.push(`/(tabs)/modules/contacts/${contact.id}` as Href)}
                    />
                  ))
                )}
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'notlar' ? (
          data.notes || data.blacklistReason ? (
            <>
              {data.notes ? (
                <Card className="gap-1.5">
                  <Eyebrow>Not</Eyebrow>
                  <Text className="font-inter text-sm text-foreground">{data.notes}</Text>
                </Card>
              ) : null}
              {data.blacklistReason ? (
                <Card className="gap-1.5">
                  <Eyebrow>Kara liste gerekçesi</Eyebrow>
                  <Text className="font-inter text-sm text-destructive">{data.blacklistReason}</Text>
                </Card>
              ) : null}
            </>
          ) : (
            <EmptyState title="Not girilmemiş" />
          )
        ) : null}

        {tab === 'aktiviteler' ? (
          activities.isPending ? (
            <Loading />
          ) : contactActivities.length === 0 ? (
            <EmptyState title="Aktivite bulunamadı" hint={data.companyId ? undefined : 'Kontak bir firmaya bağlı değil.'} />
          ) : (
            <View className="gap-2">
              {contactActivities.map((activity) => (
                <ListRow
                  key={activity.id}
                  title={activity.subject}
                  lines={[activity.type?.name, formatDateTime(activity.activityDate), activity.result]}
                  icon="pulse-outline"
                  iconTone={activity.origin === 'system' ? 'neutral' : 'info'}
                  onPress={() => router.push(`/(tabs)/modules/activities/${activity.id}` as Href)}
                />
              ))}
              {activities.hasNextPage ? (
                <Button
                  label="Daha Fazla Aktivite"
                  variant="ghost"
                  loading={activities.isFetchingNextPage}
                  disabled={activities.isFetchingNextPage}
                  onPress={() => void activities.fetchNextPage()}
                />
              ) : null}
            </View>
          )
        ) : null}

        {canDelete ? (
          <Button
            label="Kontağı Sil"
            variant="destructive"
            loading={remove.isPending}
            disabled={remove.isPending}
            onPress={() => confirmDelete(data.id, data.fullName)}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
