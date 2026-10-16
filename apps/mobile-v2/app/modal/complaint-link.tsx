import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useComplaintLinkMutations } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Field } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { DevicePicker, FormSection, type DeviceChoice } from '@/src/ui/service/fields';
import { ComplaintQr } from '@/src/ui/service/ComplaintQr';
import { complaintFormUrl, openComplaintUrl, shareComplaintUrl } from '@/src/ui/service/complaintShare';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateComplaintLinkDialog: "Herkese Açık Şikayet Linki". */
export default function ComplaintLinkScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('service_tickets.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string; title?: string }>();
  const { create } = useComplaintLinkMutations();

  const initialCompanyId = first(params.companyId);
  const [company, setCompany] = useState<PickedRecord | null>(
    initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(first(params.customerDeviceId) || null);
  const [device, setDevice] = useState<DeviceChoice | null>(null);
  const [title, setTitle] = useState(first(params.title));
  const [result, setResult] = useState<{ url: string; expiresAt: string | null } | null>(null);

  if (!canCreate) return <Redirect href={'/(tabs)/modules/service-complaints/links' as Href} />;

  const scope = device
    ? [device.model, device.serialNumber].filter(Boolean).join(' · ')
    : deviceId
      ? 'Seçili makine'
      : company
        ? `${company.name} firmasındaki tüm makineler`
        : 'Genel servis bildirim formu';

  const submit = () => {
    create.mutate(
      { companyId: company?.id ?? null, customerDeviceId: deviceId, title: title.trim() || null },
      {
        onSuccess: (link) => {
          const url = complaintFormUrl(link.publicPath);
          setResult({ url, expiresAt: link.accessTokenExpiresAt });
          toast.success('Public şikayet linki oluşturuldu');
          void shareComplaintUrl(url, title).catch(() => undefined);
        },
        onError: (error) => toast.error(`Link oluşturulamadı: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Herkese Açık Şikayet Linki', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Link kapsamı" hint="Linkin kapsamını belirleyin; müşteri giriş yapmadan güvenli servis bildirimi oluşturabilsin.">
            <CompanyPicker
              label="Firma"
              placeholder="Genel link"
              value={company}
              disabled={!!result}
              onChange={(next) => {
                setCompany(next);
                setDeviceId(null);
                setDevice(null);
              }}
            />
            <DevicePicker
              label="Makine"
              companyId={result ? null : company?.id ?? null}
              value={deviceId}
              onChange={(next) => {
                setDeviceId(next?.id ?? null);
                setDevice(next);
              }}
            />
            <Field label="Başlık" value={title} onChangeText={setTitle} placeholder="Servis Şikayet Formu" maxLength={255} editable={!result} />
          </FormSection>

          <Card className="gap-3">
            <View className="flex-row gap-2">
              <Ionicons name="git-network-outline" size={18} color={colors.primary} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-semibold text-[13px] text-foreground">Link kapsamı</Text>
                <Text className="font-inter text-xs text-muted-foreground">{scope}</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-semibold text-[13px] text-foreground">Geçerlilik</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  Link sunucuda tanımlı güvenli süre boyunca aktif kalır; gerektiğinde yenilenebilir veya iptal edilebilir.
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              <Text className="flex-1 font-inter text-xs text-muted-foreground">
                Bu linke sahip kişiler servis formunu görüntüleyebilir ve bildirim gönderebilir. Link yalnız hedef firma veya makine bağlamını paylaşır; iç CRM kayıtlarına erişim vermez.
              </Text>
            </View>
          </Card>

          {result ? (
            <Card className="gap-3 border-success-border bg-success-soft">
              <View className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text className="font-inter-semibold text-[13px] text-success">Link kullanıma hazır</Text>
              </View>
              <ComplaintQr value={result.url} size={180} />
              <Text selectable className="font-inter text-xs text-foreground">{result.url}</Text>
              {result.expiresAt ? (
                <Text className="font-inter text-[11px] text-muted-foreground">Son geçerlilik: {formatDateTime(result.expiresAt)}</Text>
              ) : null}
              <View className="flex-row gap-2">
                <Button className="flex-1" label="Paylaş" variant="ghost" trailingIcon="share-outline" onPress={() => void shareComplaintUrl(result.url, title)} />
                <Button
                  className="flex-1"
                  label="Aç"
                  variant="ghost"
                  trailingIcon="open-outline"
                  onPress={() => void openComplaintUrl(result.url).catch(() => toast.error('Link açılamadı.'))}
                />
              </View>
            </Card>
          ) : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Kapat" variant="ghost" onPress={() => router.back()} />
          {result ? null : (
            <Button className="flex-[2]" label="Link oluştur" loading={create.isPending} disabled={create.isPending} onPress={submit} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
