import type { AuthContext } from '../../shared/security/auth.types';

/**
 * İmza yetki kuralları tek yerde.
 *
 * Yeni bir izin kaynağı (PERMISSION_RESOURCES) eklenmedi; imzalar kiracı
 * genelinde geçerli bir ayar olduğu için mevcut `tenants.update` izni
 * kullanılır — seed matrisinde bu izin yalnızca `super_admin` ve `admin`
 * rollerindedir.
 *
 * Bunun bilinçli bir güvenlik kararı olduğunu not etmek gerekir: imza,
 * belgede bir kişinin adını ve ıslak imza görselini temsil eder. Teklif
 * yazabilen herkesin "Genel Müdür" imzası tanımlayabilmesi sahtecilik
 * riskidir; bu yüzden tanımlama yönetici işidir, seçim ise satış işidir.
 */
export function canManageSignatures(actor: AuthContext): boolean {
  return actor.permissions.has('tenants.update');
}

/**
 * İmzayı belgede seçebilmek/görebilmek için: teklif ailesinden herhangi bir
 * belgeyi okuyabiliyor olmak yeterlidir.
 */
export function canReadSignatures(actor: AuthContext): boolean {
  return (
    canManageSignatures(actor)
    || actor.permissions.has('quotes.read')
    || actor.permissions.has('proformas.read')
    || actor.permissions.has('contracts.read')
  );
}
