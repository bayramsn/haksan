import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaConnection, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { ConfirmCheck } from '@/src/ui/meta/parts';

type Draft = {
  name: string;
  accessToken: string;
  businessId: string;
  pageId: string;
  instagramAccountId: string;
  adAccountId: string;
  datasetId: string;
  whatsappBusinessAccountId: string;
  phoneNumberId: string;
};

const EMPTY: Draft = {
  name: '',
  accessToken: '',
  businessId: '',
  pageId: '',
  instagramAccountId: '',
  adAccountId: '',
  datasetId: '',
  whatsappBusinessAccountId: '',
  phoneNumberId: '',
};

const ID_FIELDS: { key: Exclude<keyof Draft, 'name' | 'accessToken'>; label: string }[] = [
  { key: 'businessId', label: 'Business ID' },
  { key: 'pageId', label: 'Facebook Page ID' },
  { key: 'instagramAccountId', label: 'Instagram hesap ID' },
  { key: 'adAccountId', label: 'Reklam hesap ID' },
  { key: 'datasetId', label: 'Dataset / Pixel ID' },
  { key: 'whatsappBusinessAccountId', label: 'WhatsApp Business ID' },
  { key: 'phoneNumberId', label: 'WhatsApp telefon ID' },
];

export default function MetaConnectionModal() {
  const router = useRouter();
  const { canManageConnections } = useMetaPermissions();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const create = useCreateMetaConnection();
  const set = (key: keyof Draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const accessToken = draft.accessToken.trim();
    if (!draft.name.trim() || !accessToken || !confirmed) {
      toast.error("Bağlantı adı, erişim token'ı ve güvenlik onayı zorunludur");
      return;
    }
    const optional = (value: string) => value.trim() || undefined;
    const body = {
      name: draft.name.trim(),
      accessToken,
      pageId: optional(draft.pageId),
      instagramAccountId: optional(draft.instagramAccountId),
      adAccountId: optional(draft.adAccountId),
      businessId: optional(draft.businessId),
      datasetId: optional(draft.datasetId),
      whatsappBusinessAccountId: optional(draft.whatsappBusinessAccountId),
      phoneNumberId: optional(draft.phoneNumberId),
      permissions: [],
    };
    // Token bellekte yalnız istek süresince kalır.
    setDraft((current) => ({ ...current, accessToken: '' }));
    create.mutate(body, {
      onSuccess: () => {
        toast.success('Meta bağlantısı oluşturuldu');
        setDraft(EMPTY);
        router.back();
      },
      onError: (error) => toast.error(`Meta bağlantısı oluşturulamadı: ${getMetaErrorMessage(error)}`),
    });
  };

  return (
    <ModalForm
      title="Meta işletme bağlantısı ekle"
      submitLabel={create.isPending ? 'Doğrulanıyor' : 'Doğrulayıp bağla'}
      onSubmit={submit}
      loading={create.isPending}
      disabled={!canManageConnections || !confirmed}
    >
      <Text className="font-inter text-sm text-muted-foreground">
        Yalnız kullanacağınız Meta varlık kimliklerini girin. Bağlantı sunucuda doğrulanmadan kaydedilmez.
      </Text>
      <Field label="Bağlantı adı" value={draft.name} onChangeText={set('name')} maxLength={120} placeholder="Haksan Meta Business" />
      <Field
        label="Page access token"
        value={draft.accessToken}
        onChangeText={set('accessToken')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        spellCheck={false}
        placeholder="Token yalnız bu gönderimde kullanılır"
      />
      <Text className="-mt-3 font-inter text-xs text-muted-foreground">Token görünür metin, cihaz depolaması veya uygulama loglarına yazılmaz.</Text>
      {ID_FIELDS.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          value={draft[field.key]}
          onChangeText={set(field.key)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={64}
        />
      ))}
      <ConfirmCheck
        checked={confirmed}
        onChange={setConfirmed}
        text="Token'ın bu işletmeye ait olduğunu, gerekli en az izinlerle üretildiğini ve güvenli kanaldan alındığını onaylıyorum."
      />
    </ModalForm>
  );
}
