import { inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AuthContext } from '../security/auth.types';

/**
 * Aktif bölüm (CNC/Üniversal/Sac) kapsamı.
 *  - `all`  → bölüm filtresi yok (tüm bölümler / "Tümü").
 *  - `list` → yalnızca verilen bölüm id'leri.
 */
export type DivisionScope = { mode: 'all' } | { mode: 'list'; divisionIds: string[] };

/** İstemcinin gönderdiği aktif bölüm başlığı adı. */
export const ACTIVE_DIVISION_HEADER = 'x-active-division';

/**
 * Aktif bölüm bağlamını çözer:
 *  - `view_all` kullanıcılar `X-Active-Division` başlığıyla tek bir bölüme
 *    daralabilir; başlık yok veya "all" ise hepsini görür.
 *  - `view_all` olmayanlar her zaman yalnızca kendi bölümlerine kısıtlıdır
 *    (başlık yok sayılır).
 */
export function resolveDivisionScope(actor: AuthContext, activeHeader?: string | null): DivisionScope {
  if (actor.canViewAllDivisions) {
    if (!activeHeader || activeHeader === 'all') return { mode: 'all' };
    return { mode: 'list', divisionIds: [activeHeader] };
  }
  return { mode: 'list', divisionIds: actor.divisionIds };
}

export function resolveActorDivisionScope(actor: AuthContext): DivisionScope {
  return resolveDivisionScope(actor, actor.activeDivisionId);
}

/**
 * Bir sorgu kolonuna uygulanacak bölüm filtresi.
 *  - `all`           → undefined (filtre yok).
 *  - boş liste       → hiçbir şey görme (`1 = 0`).
 *  - dolu liste      → `column IN (...)` (NULL bölümlü eski kayıtları hariç tutar).
 */
export function divisionFilter(scope: DivisionScope, column: AnyColumn): SQL | undefined {
  if (scope.mode === 'all') return undefined;
  if (scope.divisionIds.length === 0) return sql`1 = 0`;
  return inArray(column, scope.divisionIds);
}

export function companyPortfolioFilter(scope: DivisionScope, companyIdColumn: AnyColumn): SQL | undefined {
  if (scope.mode === 'all') return undefined;
  if (scope.divisionIds.length === 0) return sql`1 = 0`;
  return sql`exists (
    select 1
    from company_divisions cd
    where cd.company_id = ${companyIdColumn}
      and cd.division_id in (${sql.join(scope.divisionIds.map((id) => sql`${id}`), sql`, `)})
  )`;
}

/**
 * Create sırasında bir işe atanacak bölümü belirler:
 *  - `view_all` kullanıcı input'tan bir bölüm seçebilir (verdiyse o, yoksa null).
 *  - diğerleri her zaman kendi birincil bölümlerine atanır.
 */
export function resolveAssignedDivision(actor: AuthContext, requested?: string | null): string | null {
  if (actor.canViewAllDivisions) return requested ?? actor.primaryDivisionId ?? null;
  return actor.primaryDivisionId ?? null;
}
