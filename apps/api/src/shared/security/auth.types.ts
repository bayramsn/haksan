import 'fastify';

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: Set<string>;
  sessionId?: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    requestId?: string;
  }
}
