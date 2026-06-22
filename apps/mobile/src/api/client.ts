import type { CallAssistantAction, ManualCallEventInput, MobileCallEventInput } from '@haksan/shared';

export type HaksanUser = {
  id: string;
  email: string;
  fullName?: string | null;
  roles?: string[];
  permissions?: string[];
};

export type LoginResult = {
  accessToken: string;
  user: HaksanUser;
};

export type CallSuggestion = {
  id: string;
  title: string;
  body: string | null;
  status: 'pending' | 'acted' | 'dismissed';
  companyId: string;
  contactId: string | null;
  event: {
    id: string;
    eventType: 'completed' | 'missed';
    direction: 'inbound' | 'outbound';
    normalizedPhone: string | null;
    endedAt: string | null;
    startedAt: string | null;
  };
  company: { id: string; legalTitle: string; shortName?: string | null };
  contact: { id: string; fullName: string } | null;
  availableActions: { createQuote: boolean; createServiceTicket: boolean; logCall: boolean };
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type IngestResult = {
  event: {
    id: string;
    matchStatus: 'matched' | 'unmatched' | 'ambiguous';
    normalizedPhone: string | null;
    companyId: string | null;
    contactId: string | null;
  };
  suggestions: CallSuggestion[];
  idempotent?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export class HaksanApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string | null
  ) {}

  async login(email: string, password: string) {
    return this.request<LoginResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
  }

  async me() {
    return this.request<{ user: HaksanUser }>('/auth/me');
  }

  async suggestions() {
    return this.request<Paginated<CallSuggestion>>('/call-assistant/suggestions?status=pending');
  }

  async action(id: string, action: CallAssistantAction) {
    return this.request(`/call-assistant/suggestions/${id}/actions`, {
      method: 'POST',
      body: { action },
    });
  }

  async sendMobileCallEvent(input: MobileCallEventInput) {
    return this.request<IngestResult>('/mobile/calls/events', {
      method: 'POST',
      body: input,
    });
  }

  async sendManualCallEvent(input: ManualCallEventInput) {
    return this.request<IngestResult>('/call-assistant/manual-events', {
      method: 'POST',
      body: input,
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (!options.skipAuth && this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    const payload = text ? safeJson(text) : null;
    if (!res.ok) {
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: unknown }).message)
          : `API isteği başarısız (${res.status})`;
      throw new ApiError(message, res.status, payload);
    }
    return payload as T;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
