import { seedLookups } from './lookups';
import { closeDb } from '../client';

/**
 * Varsayılan seed: yalnızca lookup / izin kataloğu (referans tablolar).
 * Müşteri, teklif, ürün, stok gibi iş verisi OLUŞTURMAZ.
 *
 * Canlı kurulum:  npm run db:migrate && npm run db:seed && npm run db:bootstrap
 * Demo (geliştirme): npm run db:seed:demo
 */
async function main() {
  console.log('[seed] lookups (referans tablolar, iş verisi yok) …');
  await seedLookups();
  await closeDb();
  console.log('[seed] tamamlandı.');
  console.log('[seed] Canlı kurulum için: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:bootstrap');
  console.log('[seed] Demo veri için: npm run db:seed:demo');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
