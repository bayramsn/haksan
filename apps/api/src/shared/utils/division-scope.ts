import { inArray, isNull, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AuthContext } from '../security/auth.types';
import { ForbiddenError } from './errors';

/**
 * Aktif bölüm (CNC/Üniversal/Sac) kapsamı.
 *  - `all`  → bölüm filtresi yok (tüm bölümler / "Tümü").
 *  - `list` → yalnızca verilen bölüm id'leri.
 */
export type DivisionScope = { mode: 'all' } | { mode: 'list'; divisionIds: string[] };

/** İstemcinin gönderdiği aktif bölüm başlığı adı. */
export const ACTIVE_DIVISION_HEADER = 'x-active-division';
/** İstemcinin gönderdiği aktif departman başlığı adı. */
export const ACTIVE_DEPARTMENT_HEADER = 'x-active-department';

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

function departmentMatches(scopeDepartmentId: string | null, activeDepartmentId: string | null): boolean {
  if (!activeDepartmentId || activeDepartmentId === 'all') return true;
  return scopeDepartmentId === null || scopeDepartmentId === activeDepartmentId;
}

function allResourceScopes(actor: AuthContext, resource: string) {
  return actor.accessScopes.filter((scope) => scope.resource === resource);
}

function activeResourceScopes(actor: AuthContext, resource: string) {
  const rows = actor.accessScopes.filter((scope) => scope.resource === resource);
  if (rows.length === 0) return null;
  return rows.filter((scope) => departmentMatches(scope.departmentId, actor.activeDepartmentId));
}

function fallbackResourceScope(actor: AuthContext): DivisionScope {
  return resolveActorDivisionScope(actor);
}

/**
 * Resource bazlı aktif bölüm kapsamını çözer.
 *  - resource için scope yoksa eski user_divisions davranışına düşer.
 *  - divisionId=null scope'u "Tümü" yetkisidir.
 *  - "all" başlığı yalnızca Tümü scope'u varsa filtresiz kapsama dönüşür.
 *  - Tümü scope'u olmayan kullanıcıda başlık "all" olsa bile yalnızca birincil
 *    kapsam döner.
 */
export function resolveResourceDivisionScope(actor: AuthContext, resource: string): DivisionScope {
  const rows = activeResourceScopes(actor, resource);
  if (rows === null) return fallbackResourceScope(actor);
  if (rows.length === 0) return { mode: 'list', divisionIds: [] };

  const hasAllDivisionScope = rows.some((scope) => scope.divisionId === null);
  const activeDivisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null;
  if (hasAllDivisionScope) {
    if (activeDivisionId) return { mode: 'list', divisionIds: [activeDivisionId] };
    return { mode: 'all' };
  }

  const concreteDivisionIds = rows.map((scope) => scope.divisionId).filter((id): id is string => !!id);
  if (activeDivisionId) {
    return concreteDivisionIds.includes(activeDivisionId) ? { mode: 'list', divisionIds: [activeDivisionId] } : { mode: 'list', divisionIds: [] };
  }
  const primary = rows.find((scope) => scope.isPrimary && scope.divisionId)?.divisionId ?? concreteDivisionIds[0] ?? null;
  return { mode: 'list', divisionIds: primary ? [primary] : [] };
}

export function resourceDivisionFilter(actor: AuthContext, resource: string, column: AnyColumn): SQL | undefined {
  return divisionFilter(resolveResourceDivisionScope(actor, resource), column);
}

export function resourceDivisionFilterWithShared(actor: AuthContext, resource: string, column: AnyColumn): SQL | undefined {
  return divisionFilterWithShared(resolveResourceDivisionScope(actor, resource), column);
}

export function resourceCompanyPortfolioFilter(actor: AuthContext, resource: string, companyIdColumn: AnyColumn): SQL | undefined {
  return companyPortfolioFilter(resolveResourceDivisionScope(actor, resource), companyIdColumn);
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

/**
 * `divisionFilter` ile aynı, ancak paylaşılan "Tümü" (NULL bölüm) kayıtlarını DA
 * dahil eder — ürün listeleri / teknik bilgi şablonları gibi bölüme atanabilen ama
 * bölümsüz de olabilen referans veriler için.
 *  - `all`      → undefined (filtre yok).
 *  - boş liste  → yalnızca paylaşılan (`column IS NULL`).
 *  - dolu liste → `column IN (...) OR column IS NULL`.
 */
export function divisionFilterWithShared(scope: DivisionScope, column: AnyColumn): SQL | undefined {
  if (scope.mode === 'all') return undefined;
  if (scope.divisionIds.length === 0) return isNull(column);
  return or(inArray(column, scope.divisionIds), isNull(column));
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

function isDivisionAllowedForResource(actor: AuthContext, resource: string, divisionId: string): boolean {
  const allRows = allResourceScopes(actor, resource);
  if (allRows.length === 0) {
    return actor.canViewAllDivisions || actor.divisionIds.includes(divisionId);
  }
  const rows = activeResourceScopes(actor, resource) ?? [];
  return rows.some((scope) => scope.divisionId === null || scope.divisionId === divisionId);
}

/**
 * Create/update sırasında atanacak somut bölümü çözer ve resource scope'una göre
 * doğrular. Aktif bölüm "all" ise somut bölüm input'u zorunludur; bu yüzden
 * uygun bölüm bulunamazsa null döner, çağıran modül alan bazlı 422 üretebilir.
 */
export function resolveAssignedResourceDivision(actor: AuthContext, resource: string, requested?: string | null): string | null {
  const cleanRequested = requested && requested !== 'all' ? requested : null;
  if (cleanRequested) {
    if (!isDivisionAllowedForResource(actor, resource, cleanRequested)) {
      throw new ForbiddenError('Bu bölümde işlem yapamazsınız');
    }
    return cleanRequested;
  }

  const activeDivisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null;
  if (activeDivisionId) {
    if (!isDivisionAllowedForResource(actor, resource, activeDivisionId)) {
      throw new ForbiddenError('Bu bölümde işlem yapamazsınız');
    }
    return activeDivisionId;
  }

  const rows = activeResourceScopes(actor, resource);
  if (rows !== null) {
    const primary = rows.find((scope) => scope.isPrimary && scope.divisionId)?.divisionId ?? rows.find((scope) => scope.divisionId)?.divisionId ?? null;
    if (primary) return primary;
    if (rows.some((scope) => scope.divisionId === null) && actor.activeDivisionId !== 'all') {
      return actor.primaryDivisionId ?? null;
    }
    return null;
  }

  return resolveAssignedDivision(actor, null);
}

export function assertCanUseResourceDivision(actor: AuthContext, resource: string, divisionId: string | null | undefined): void {
  if (!divisionId) return;
  if (!isDivisionAllowedForResource(actor, resource, divisionId)) {
    throw new ForbiddenError('Bu bölümde işlem yapamazsınız');
  }
}
