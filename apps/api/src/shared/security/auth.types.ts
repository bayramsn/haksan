import 'fastify';

export interface AuthAccessScope {
  resource: string;
  departmentId: string | null;
  divisionId: string | null;
  isPrimary: boolean;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: Set<string>;
  sessionId?: string | null;
  /** Kullanıcının üye olduğu bölüm (CNC/Üniversal/Sac) id'leri. */
  divisionIds: string[];
  /** Yeni iş oluştururken otomatik atanan birincil bölüm (yoksa null). */
  primaryDivisionId: string | null;
  /** Kullanıcının atanmış departman id'leri. Boş liste, yalnızca scope'lara bakılacağı anlamına gelir. */
  departmentIds: string[];
  /** Varsayılan aktif departman (yoksa null). */
  primaryDepartmentId: string | null;
  /** `divisions.view_all` yetkisi — tüm bölümleri görür ve bölüm seçebilir. */
  canViewAllDivisions: boolean;
  /** İsteğin `X-Active-Division` başlığından gelen aktif bölüm (id | 'all' | null). */
  activeDivisionId: string | null;
  /** İsteğin `X-Active-Department` başlığından gelen aktif departman (id | null). */
  activeDepartmentId: string | null;
  /** Kullanıcının sayfa/modül + departman + bölüm kapsamları. */
  accessScopes: AuthAccessScope[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    requestId?: string;
  }
}
