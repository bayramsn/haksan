import { normalizePhoneNumber } from '@haksan/shared';
import { Linking } from 'react-native';
import { beginCall, clearCall } from './storage';
import { dialablePhone } from './policy';

/**
 * Arama asistan izni olmadan da çalışır; CRM bağlamı yalnız açık rızayla saklanır.
 * Firma/kontak bilinen ekranlar bağlamı geçirmeli: aynı numara birden fazla
 * kayıtta olsa bile dönüşte seçim sorulmaz.
 */
export async function startCrmCall(phone: string, context: { companyId?: string | null; contactId?: string | null } = {}): Promise<void> {
  const dialable = dialablePhone(phone);
  if (!dialable) throw new Error('Geçerli bir telefon numarası bulunamadı.');
  const number = normalizePhoneNumber(dialable);
  // Normalize edilemeyen numara yine aranır ama eşleştirme bağlamı tutulmaz.
  const call = number
    ? await beginCall(number, { companyId: context.companyId ?? undefined, contactId: context.contactId ?? undefined }).catch(() => null)
    : null;
  try {
    await Linking.openURL(`tel:${number ?? dialable}`);
  } catch (error) {
    // Arama hiç başlamadıysa dönüşte "arama sonrası" önerisi çıkmasın; daha yeni bir aramaya dokunulmaz.
    if (call) await clearCall(call.id).catch(() => undefined);
    throw error;
  }
}
