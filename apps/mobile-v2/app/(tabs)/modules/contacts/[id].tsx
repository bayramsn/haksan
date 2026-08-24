import { useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActivityList, useContact, useDeleteContact, useLookup } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/src/lib/format';
import { Avatar } from '@/src/ui/Avatar';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, ListRow, Loading } from '@/src/ui';
import { InfoRows, Tabs } from '@/src/ui/data';

type ContactTab = 'iletisim' | 'genel' | 'notlar' | 'aktiviteler';

const GENDER_LABELS: Record<string, string> = { male: 'Erkek', female: 'Kadın' };

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

  function confirmDelete(contactId: string, fullName: string) {
    Alert.alert(
      'Kontağı sil',
      `${fullName} kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            remove.mutate(contactId, {
              onSuccess: () => router.replace('/(tabs)/modules/contacts'),
              onError: (deleteError) => Alert.alert('Kontak silinemedi', deleteError.message),
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

      <View className="gap-3 px-4 pt-4">
        <Card className="items-center gap-2 py-6">
          <Avatar name={data.fullName} size={68} />
          <Text className="text-center text-[19px] font-inter-semibold text-foreground">{data.fullName}</Text>
          {data.title ? <Text className="font-inter text-[13px] text-muted-foreground">{data.title}</Text> : null}
          <View className="flex-row flex-wrap justify-center gap-1.5 pt-1">
            {data.isPrimary ? <Chip tone="success" label="Birincil kontak" /> : null}
            {data.isBlacklisted ? <Chip tone="destructive" label="Kara liste" /> : null}
            {decisionRole ? <Chip tone="info" label={decisionRole.name} /> : null}
          </View>
        </Card>

        {phone || email ? (
          <View className="flex-row gap-3">
            {phone ? (
              <View className="flex-1">
                <Button label="Ara" onPress={() => void Linking.openURL(`tel:${phone}`)} />
              </View>
            ) : null}
            {email ? (
              <View className="flex-1">
                <Button label="E-posta" variant="ghost" onPress={() => void Linking.openURL(`mailto:${email}`)} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="pt-3">
        <Tabs
          tabs={[
            { value: 'iletisim', label: 'İletişim' },
            { value: 'genel', label: 'Genel' },
            { value: 'notlar', label: 'Notlar' },
            { value: 'aktiviteler', label: 'Aktiviteler', badge: activities.data?.total ?? contactActivities.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
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
                ]}
              />
            </Card>

            {data.companyLinks?.length ? (
              <View className="gap-1.5">
                <View className="px-1">
                  <Eyebrow>Bağlı firmalar ({data.companyLinks.length})</Eyebrow>
                </View>
                {data.companyLinks.map((company) => (
                  <ListRow
                    key={company.id}
                    title={company.legalTitle}
                    lines={[company.city]}
                    icon="business-outline"
                    iconTone="info"
                    chip={company.isPrimary ? { label: 'Birincil', tone: 'success' } : undefined}
                    onPress={() => router.push(`/(tabs)/modules/companies/${company.id}`)}
                  />
                ))}
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
