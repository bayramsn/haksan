/**
 * Elle çalıştırılan, tek seferlik onarım: lazer ürün kartlarının teknik anlık görüntüsünde
 * Türkçe sözlükten geçmemiş (Çince) değerleri güncel çeviriyle değiştirir.
 *
 * Kart, içe aktarıldığı andaki çevrilmiş değerleri saklar; sözlük sonradan genişlediğinde
 * kart kendiliğinden düzelmez. Yalnız Çince karakter içeren ve elle düzenlenmemiş
 * (`isManual` değil) alanlar, aynı seçimin yeniden çözülmüş değeriyle değişir; diğer her şey
 * olduğu gibi kalır. Varsayılan önizlemedir, yazmak için `--apply`.
 *
 *   node dist/db/refresh-laser-translations.js [--apply]
 */
import 'reflect-metadata';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { laserTechnicalConfigurationSchema, resolveLaserProfile, type LaserTechnicalConfiguration } from '@haksan/shared';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';

const CHINESE = /[一-鿿　-〿！-～]/;

/** Kartın anlık görüntüsünü onarır; değişiklik yoksa `null`. */
export function retranslateConfiguration(configuration: LaserTechnicalConfiguration): LaserTechnicalConfiguration | null {
  if (!configuration.specs.some((spec) => CHINESE.test(spec.value))) return null;
  let resolved: Map<string, string>;
  try {
    resolved = new Map(resolveLaserProfile(configuration.selection).specs.map((spec) => [spec.key, spec.value]));
  } catch {
    return null; // Model artık katalogda yoksa dokunulmaz.
  }
  let changed = false;
  const specs = configuration.specs.map((spec) => {
    const fresh = resolved.get(spec.key);
    if (spec.isManual || !CHINESE.test(spec.value) || !fresh || CHINESE.test(fresh)) return spec;
    changed = true;
    return { ...spec, value: fresh };
  });
  return changed ? { ...configuration, specs } : null;
}

export async function refreshLaserTranslations(db: DbClient, apply = false) {
  const rows = await db
    .select({ id: s.productModels.id, modelCode: s.productModels.modelCode, configuration: s.productModels.technicalConfiguration })
    .from(s.productModels)
    .where(and(isNull(s.productModels.deletedAt), isNotNull(s.productModels.technicalConfiguration)));
  const updates: Array<{ id: string; modelCode: string; configuration: LaserTechnicalConfiguration }> = [];
  for (const row of rows) {
    const parsed = laserTechnicalConfigurationSchema.safeParse(row.configuration);
    if (!parsed.success) continue;
    const repaired = retranslateConfiguration(parsed.data);
    if (repaired) updates.push({ id: row.id, modelCode: row.modelCode, configuration: repaired });
  }
  if (apply && updates.length) {
    await db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(s.productModels)
          .set({ technicalConfiguration: update.configuration, updatedAt: new Date() })
          .where(eq(s.productModels.id, update.id));
      }
    });
  }
  return { scanned: rows.length, toUpdate: updates.length, applied: apply, sample: updates.slice(0, 10).map((u) => u.modelCode) };
}

if (require.main === module) {
  const db = getDb();
  refreshLaserTranslations(db, process.argv.includes('--apply'))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Laser translation refresh failed');
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
