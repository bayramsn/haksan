/**
 * Data migration: mevcut firma ve kontak isimlerini Türkçe kurallarıyla BÜYÜK
 * harfe çevirir.
 *
 * Create/update yolları `normalizeUpperName` üzerinden zaten büyük harfe
 * çeviriyor; bu migration ise normalizasyon öncesi girilmiş eski kayıtları
 * (kontak `full_name`, firma `legal_title` / `short_name`) tek seferde hizalar.
 *
 * Idempotent: yalnızca büyük harfli hali farklı olan satırları günceller, bu
 * yüzden tekrar çalıştırılması güvenlidir. Postgres `upper()` Türkçe i→İ
 * kuralını uygulamadığı için dönüştürme uygulama tarafında yapılır.
 */
import { eq } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';
import { normalizeUpperName } from '../../shared/utils/text-normalization';

export async function up(db: DbClient): Promise<void> {
  const contactRows = await db
    .select({ id: schema.contacts.id, fullName: schema.contacts.fullName })
    .from(schema.contacts);
  for (const row of contactRows) {
    const upper = normalizeUpperName(row.fullName ?? '');
    if (upper && upper !== row.fullName) {
      await db.update(schema.contacts).set({ fullName: upper }).where(eq(schema.contacts.id, row.id));
    }
  }

  const companyRows = await db
    .select({
      id: schema.companies.id,
      legalTitle: schema.companies.legalTitle,
      shortName: schema.companies.shortName,
    })
    .from(schema.companies);
  for (const row of companyRows) {
    const patch: { legalTitle?: string; shortName?: string } = {};
    const upperLegal = normalizeUpperName(row.legalTitle ?? '');
    if (upperLegal && upperLegal !== row.legalTitle) patch.legalTitle = upperLegal;
    if (row.shortName) {
      const upperShort = normalizeUpperName(row.shortName);
      if (upperShort !== row.shortName) patch.shortName = upperShort;
    }
    if (Object.keys(patch).length) {
      await db.update(schema.companies).set(patch).where(eq(schema.companies.id, row.id));
    }
  }
}
