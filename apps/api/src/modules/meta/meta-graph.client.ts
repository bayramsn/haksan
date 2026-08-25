import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { MetaConfigurationError, MetaUpstreamError } from './meta.errors';

type GraphScalar = string | number | boolean;
type GraphParameters = Record<string, GraphScalar | undefined>;

interface GraphErrorEnvelope {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

@Injectable()
export class MetaGraphClient {
  private configuration() {
    const env = loadEnv();
    if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_WEBHOOK_VERIFY_TOKEN || !env.META_CREDENTIAL_ENCRYPTION_KEY) {
      throw new MetaConfigurationError();
    }
    const base = new URL(env.META_GRAPH_BASE_URL);
    const localTestHost = env.NODE_ENV === 'test' && ['localhost', '127.0.0.1', '::1'].includes(base.hostname);
    if ((!localTestHost && base.protocol !== 'https:') || (!localTestHost && base.hostname !== 'graph.facebook.com')) {
      throw new MetaConfigurationError('META_GRAPH_BASE_URL güvenilir bir Meta Graph adresi olmalıdır');
    }
    return { env, base };
  }

  appSecret(): string {
    const secret = this.configuration().env.META_APP_SECRET;
    if (!secret) throw new MetaConfigurationError();
    return secret;
  }

  webhookVerifyToken(): string {
    const token = this.configuration().env.META_WEBHOOK_VERIFY_TOKEN;
    if (!token) throw new MetaConfigurationError();
    return token;
  }

  oauthRedirectUri(): string {
    const { env } = this.configuration();
    if (!env.APP_PUBLIC_URL) throw new MetaConfigurationError('Meta OAuth için APP_PUBLIC_URL ayarlanmalıdır');
    return new URL(`${env.API_PREFIX.replace(/\/$/, '')}/meta/connections/oauth/callback`, env.APP_PUBLIC_URL).toString();
  }

  authorizationUrl(state: string): string {
    const { env } = this.configuration();
    const url = new URL(`${env.META_GRAPH_API_VERSION}/dialog/oauth`, 'https://www.facebook.com/');
    url.searchParams.set('client_id', env.META_APP_ID!);
    url.searchParams.set('redirect_uri', this.oauthRedirectUri());
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [
      'pages_show_list', 'pages_read_engagement', 'leads_retrieval', 'ads_read', 'ads_management',
      'business_management', 'instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages',
      'pages_messaging', 'whatsapp_business_management', 'whatsapp_business_messaging', 'catalog_management',
    ].join(','));
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<string> {
    const { env, base } = this.configuration();
    const url = new URL(`${env.META_GRAPH_API_VERSION}/oauth/access_token`, `${base.toString().replace(/\/$/, '')}/`);
    url.searchParams.set('client_id', env.META_APP_ID!);
    url.searchParams.set('client_secret', env.META_APP_SECRET!);
    url.searchParams.set('redirect_uri', this.oauthRedirectUri());
    url.searchParams.set('code', code);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      const payload = await response.json() as { access_token?: string; error?: unknown };
      if (!response.ok || !payload.access_token || payload.error) throw new MetaUpstreamError('Meta OAuth kodu doğrulanamadı', 422);
      return payload.access_token;
    } catch (error) {
      if (error instanceof MetaUpstreamError) throw error;
      throw new MetaUpstreamError('Meta OAuth servisine ulaşılamadı', 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  async get<T>(accessToken: string, path: string, query: GraphParameters = {}): Promise<T> {
    return this.request<T>('GET', accessToken, path, query);
  }

  async post<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', accessToken, path, undefined, body);
  }

  async delete<T>(accessToken: string, path: string, query: GraphParameters = {}): Promise<T> {
    return this.request<T>('DELETE', accessToken, path, query);
  }

  async deleteBody<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('DELETE', accessToken, path, undefined, body);
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', accessToken: string, path: string, query?: GraphParameters, body?: Record<string, unknown>): Promise<T> {
    const { env, base } = this.configuration();
    const cleanPath = path.replace(/^\/+/, '');
    if (!/^[A-Za-z0-9_./-]+$/.test(cleanPath) || cleanPath.includes('..')) {
      throw new MetaUpstreamError('Geçersiz Meta kaynak yolu', 422);
    }
    const url = new URL(`${env.META_GRAPH_API_VERSION}/${cleanPath}`, `${base.toString().replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    url.searchParams.set('appsecret_proof', createHmac('sha256', this.appSecret()).update(accessToken).digest('hex'));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new MetaUpstreamError('Meta servisine ulaşılamadı', 503);
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaUpstreamError();
    }
    if (!response.ok || (payload as GraphErrorEnvelope)?.error) {
      const upstreamCode = (payload as GraphErrorEnvelope)?.error?.code;
      const status = response.status === 429 || upstreamCode === 4 || upstreamCode === 17 ? 429 : response.status >= 500 ? 503 : 422;
      throw new MetaUpstreamError(status === 429 ? 'Meta istek limiti aşıldı' : 'Meta isteği reddetti', status);
    }
    return payload as T;
  }
}
