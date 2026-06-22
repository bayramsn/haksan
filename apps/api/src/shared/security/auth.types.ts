import 'fastify';

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
  /** `divisions.view_all` yetkisi — tüm bölümleri görür ve bölüm seçebilir. */
  canViewAllDivisions: boolean;
  /** İsteğin `X-Active-Division` başlığından gelen aktif bölüm (id | 'all' | null). */
  activeDivisionId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    requestId?: string;
  }
}
