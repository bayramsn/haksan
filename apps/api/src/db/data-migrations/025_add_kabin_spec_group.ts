/**
 * Data migration: fiber lazer şablonundaki "Kabin Tipi" alanı KABIN grubunu kullanır. Grup yoksa
 * ürün kaydı "Teknik bilgi grubu ürünün bölümüne ait değil" ile düşer. 003'ü yeniden koşmak
 * 023'ün birleştirdiği ürün taksonomisini geri getirebileceği için yalnız bu satır eklenir.
 */
import type { DbClient } from '../client';
import { schema } from '../client';

export async function up(db: DbClient): Promise<void> {
  await db.insert(schema.productSpecGroups).values({ code: 'KABIN', name: 'Kabin', sortOrder: 96 }).onConflictDoNothing();
}
