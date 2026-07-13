import { and, eq, inArray, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies } from '../../db/schema/companies';
import { companyRelationTypes, companyStatuses } from '../../db/schema/lookup';
import type { AuthContext } from '../security/auth.types';

/**
 * Role bazlı firma görünürlüğü (bölüm izolasyonunun ÜSTÜNE eklenir).
 *
 * Kural — yalnızca `sales` ve `service` rollerine uygulanır; super_admin/admin
 * ve finance/stock/readonly gibi diğer tüm roller her firmayı görür:
 *
 *   | Rol     | müşteri (customer)        | müşteri+tedarikçi          | tedarikçi (supplier) |
 *   |---------|---------------------------|----------------------------|----------------------|
 *   | sales   | Cari + Potansiyel + Kara  | Cari + Potansiyel + Kara   | Hiç göremez          |
 *   | service | Cari + Kara (potansiyel ✗)| Cari + Potansiyel + Kara   | Hiç göremez          |
 *
 * "Cari" = `active` + `passive`; "Potansiyel" = `potential`; "Kara liste" =
 * `blacklist`. Kara liste, kısıtlı rollerin görebildiği ilişki tiplerinde
 * (müşteri, müşteri+tedarikçi) her zaman görünür; saf `supplier` yine gizli.
 */

// Durum (companyStatuses) kovaları.
const CARI_STATUS_CODES = ['active', 'passive'] as const;
const POTENTIAL_STATUS_CODES = ['potential'] as const;
const BLACKLIST_STATUS_CODES = ['blacklist'] as const;
// Cari + kara liste (potansiyel hariç) — servis rolünün saf müşterileri için.
const CARI_AND_BLACKLIST: string[] = [...CARI_STATUS_CODES, ...BLACKLIST_STATUS_CODES];
// Tüm görünür durumlar (cari + potansiyel + kara liste).
const ALL_VISIBLE_STATUSES: string[] = [
  ...CARI_STATUS_CODES,
  ...POTENTIAL_STATUS_CODES,
  ...BLACKLIST_STATUS_CODES,
];

// Rol → (ilişki tipi kodu → görülebilen durum kodları). Listelenmeyen ilişki
// tipi (ör. saf `supplier`) o rol için hiç görünmez.
const ROLE_COMPANY_MATRIX: Record<'sales' | 'service', Record<string, string[]>> = {
  sales: {
    customer: ALL_VISIBLE_STATUSES,
    supplier_customer: ALL_VISIBLE_STATUSES,
  },
  service: {
    customer: CARI_AND_BLACKLIST, // cari + kara liste, potansiyel hariç
    supplier_customer: ALL_VISIBLE_STATUSES,
  },
};

const RESTRICTED_ROLES = Object.keys(ROLE_COMPANY_MATRIX);

/**
 * Aktörün firma görünürlüğü role göre kısıtlı mı?
 * Kısıt yalnızca rolleri TAMAMEN {sales, service} kümesinde kalan kullanıcılara
 * uygulanır; başka bir role (admin, finance, stock, readonly...) sahip kullanıcı
 * kısıtsızdır.
 */
export function hasCompanyVisibilityRestriction(actor: AuthContext): boolean {
  if (actor.roles.length === 0) return false;
  return actor.roles.every((role) => RESTRICTED_ROLES.includes(role));
}

/** Bir ilişki tipi (lookup id) + o tip için görülebilir durum (lookup id) grubu. */
type VisibilityGroup = { relationId: string; statusIds: string[] };

/**
 * Aktörün rollerinden birleşik matrisi çıkarıp lookup id'lerine çözer.
 *  - `null`        → kısıt yok (her firma görünür).
 *  - boş dizi `[]` → kısıtlı ama hiçbir firma görünmez (güvenli taraf).
 *  - dolu dizi     → görülebilir (ilişki tipi, durumlar) grupları.
 */
async function resolveVisibilityGroups(
  db: DbClient,
  actor: AuthContext
): Promise<VisibilityGroup[] | null> {
  if (!hasCompanyVisibilityRestriction(actor)) return null;

  // Birden fazla kısıtlı role sahip kullanıcılar için durumların birleşimi (union).
  const merged = new Map<string, Set<string>>();
  for (const role of actor.roles) {
    const spec = ROLE_COMPANY_MATRIX[role as 'sales' | 'service'];
    if (!spec) continue;
    for (const [relationCode, statusCodes] of Object.entries(spec)) {
      const set = merged.get(relationCode) ?? new Set<string>();
      statusCodes.forEach((code) => set.add(code));
      merged.set(relationCode, set);
    }
  }
  if (merged.size === 0) return [];

  const relationCodes = [...merged.keys()];
  const statusCodes = [...new Set([...merged.values()].flatMap((set) => [...set]))];

  const [relRows, statusRows] = await Promise.all([
    db
      .select({ id: companyRelationTypes.id, code: companyRelationTypes.code })
      .from(companyRelationTypes)
      .where(inArray(companyRelationTypes.code, relationCodes)),
    db
      .select({ id: companyStatuses.id, code: companyStatuses.code })
      .from(companyStatuses)
      .where(inArray(companyStatuses.code, statusCodes)),
  ]);
  const relId = new Map(relRows.map((r) => [r.code, r.id]));
  const statusId = new Map(statusRows.map((r) => [r.code, r.id]));

  const groups: VisibilityGroup[] = [];
  for (const [relationCode, set] of merged) {
    const rid = relId.get(relationCode);
    if (!rid) continue;
    const statusIds = [...set].map((code) => statusId.get(code)).filter((id): id is string => !!id);
    if (statusIds.length > 0) groups.push({ relationId: rid, statusIds });
  }
  return groups;
}

/**
 * sales/service rolüne göre `companies` tablosu için ilişki tipi + durum
 * görünürlük filtresi. `companies.relationTypeId` / `companies.customerStatusId`
 * kolonları üzerinde uygulanır (join gerektirmez; count, select ve findFirst
 * sorgularında kullanılabilir). Kısıt yoksa `undefined` döner.
 */
export async function companyVisibilityFilter(
  db: DbClient,
  actor: AuthContext
): Promise<SQL | undefined> {
  const groups = await resolveVisibilityGroups(db, actor);
  if (groups === null) return undefined;
  // Lookup id'leri çözülemezse güvenli taraf: hiçbir firma görünmez.
  if (groups.length === 0) return sql`1 = 0`;
  const clauses = groups.map(
    (g) => and(eq(companies.relationTypeId, g.relationId), inArray(companies.customerStatusId, g.statusIds))!
  );
  return clauses.length === 1 ? clauses[0] : or(...clauses);
}

/**
 * Firmaya bağlı KAYITLAR (fırsat, teklif, servis...) için görünürlük filtresi.
 * Kaydın `companyId` kolonu üzerinden, ilgili firmanın matrise uyup uymadığını
 * korelasyonlu bir `EXISTS` alt sorgusuyla denetler. Böylece kısıtlı bir rol,
 * göremediği bir firmaya (ör. saf tedarikçi) ait kayıtları da göremez.
 * Kısıt yoksa `undefined` döner.
 */
export async function companyVisibilityExistsFilter(
  db: DbClient,
  actor: AuthContext,
  companyIdColumn: AnyColumn
): Promise<SQL | undefined> {
  const groups = await resolveVisibilityGroups(db, actor);
  if (groups === null) return undefined;
  if (groups.length === 0) return sql`1 = 0`;
  const groupSqls = groups.map(
    (g) =>
      sql`(cv.relation_type_id = ${g.relationId} and cv.customer_status_id in (${sql.join(
        g.statusIds.map((id) => sql`${id}`),
        sql`, `
      )}))`
  );
  const matrix = sql.join(groupSqls, sql` or `);
  return sql`exists (select 1 from companies cv where cv.id = ${companyIdColumn} and (${matrix}))`;
}
