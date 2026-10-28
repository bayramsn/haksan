import * as Crypto from 'expo-crypto';
import * as SecureStore from '@/src/security/secure-store';
import { requestContextKey, RequestScopeChangedError } from '@/src/api/client';
import { EMPTY_PRODUCT_FORM, type buildProductBody, type ProductFormState, type SpecDraft, type EquipmentDraft } from './product-form';
export type PendingProductCreate = {
  scope: string; operationId: string; form: ProductFormState; specs: SpecDraft[]; supplier?: { id: string; name: string } | null;
  standardText: string; optionalText: string; originalEquipment: EquipmentDraft[]; detailsDirty: boolean;
  createBody: ReturnType<typeof buildProductBody> & { divisionId?: string };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyFor = async (scope: string) => `haksan_product_create_${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope)}`;
function valid(value: unknown, scope: string): value is PendingProductCreate {
  if (!value || typeof value !== 'object') return false;
  const row = value as PendingProductCreate;
  return row.scope === scope && uuid.test(row.operationId) && Boolean(row.form) && Object.entries(EMPTY_PRODUCT_FORM).every(([key, sample]) => {
    const item = row.form[key as keyof ProductFormState];
    return Array.isArray(sample) ? Array.isArray(item) && item.every(id => typeof id === 'string') : sample === null ? item === null || typeof item === 'string' : typeof item === typeof sample;
  }) && Array.isArray(row.specs) && row.specs.every(item => typeof item?.key === 'string' && typeof item.value === 'string' && typeof item.unit === 'string' && (item.groupCode === null || typeof item.groupCode === 'string'))
    && Array.isArray(row.originalEquipment) && row.originalEquipment.every(item => typeof item?.title === 'string' && (item.description === null || typeof item.description === 'string') && typeof item.isPromotion === 'boolean')
    && (!row.supplier || (typeof row.supplier.id === 'string' && typeof row.supplier.name === 'string'))
    && typeof row.standardText === 'string' && typeof row.optionalText === 'string' && typeof row.detailsDirty === 'boolean'
    && Boolean(row.createBody) && typeof row.createBody === 'object' && !Array.isArray(row.createBody);
}
export async function readPendingProductCreate(scope: string): Promise<PendingProductCreate | null> {
  const context = requestContextKey(); const key = await keyFor(scope); const raw = await SecureStore.getItemAsync(key);
  if (context !== requestContextKey()) throw new RequestScopeChangedError();
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Bekleyen ürün taslağı okunamadı; yeni kayıt oluşturulmadı.'); }
  if (!valid(parsed, scope)) throw new Error('Bekleyen ürün taslağı doğrulanamadı; yeni kayıt oluşturulmadı.');
  return parsed;
}
export async function writePendingProductCreate(draft: PendingProductCreate): Promise<void> {
  const context = requestContextKey(); const key = await keyFor(draft.scope);
  if (context !== requestContextKey()) throw new RequestScopeChangedError();
  await SecureStore.setItemAsync(key, JSON.stringify(draft), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  if (context !== requestContextKey()) throw new RequestScopeChangedError();
}
export async function clearPendingProductCreate(scope: string): Promise<void> {
  await SecureStore.deleteItemAsync(await keyFor(scope));
}
