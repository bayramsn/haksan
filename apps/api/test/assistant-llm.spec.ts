import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * llmAnswer sağlayıcı dallarını DB'siz test eder — AssistantService'in
 * yalnızca env + fetch kullanan kısmı çalıştırılır, bağımlılıklar boş geçilir.
 * Env loadEnv() içinde cache'lendiğinden her buildService modül kaydını
 * sıfırlar; dokunulan env anahtarları afterEach'te eski değerine döner.
 */
const touchedEnvKeys = new Map<string, string | undefined>();

async function buildService(env: Record<string, string>, db: unknown = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (!touchedEnvKeys.has(key)) touchedEnvKeys.set(key, process.env[key]);
    process.env[key] = value;
  }
  const { AssistantService } = await import('../src/modules/assistant/assistant.service');
  return new AssistantService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of touchedEnvKeys) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  touchedEnvKeys.clear();
});

describe('Assistant LLM providers', () => {
  it('kullanıcıya özel günlük USD bütçesinde üst maliyeti çağrıdan önce rezerve eder', async () => {
    let inserted: Record<string, unknown> | undefined;
    const returning = vi.fn(async () => [{ id: 'reservation-id' }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn((row: Record<string, unknown>) => {
      inserted = row;
      return { onConflictDoUpdate };
    });
    const db = {
      query: { users: { findFirst: vi.fn(async () => ({ assistantDailyUsdLimitCents: 50 })) } },
      insert: vi.fn(() => ({ values })),
    };
    const service = await buildService(
      {
        ASSISTANT_LLM_PROVIDER: 'nvidia',
        ASSISTANT_MODEL: 'qwen/qwen3-next-80b-a3b-instruct',
        ASSISTANT_API_KEY: 'test-nvidia-key-123456',
        ASSISTANT_DAILY_TOKEN_BUDGET: '50000',
        ASSISTANT_INPUT_USD_PER_MILLION_TOKENS: '0.10',
        ASSISTANT_OUTPUT_USD_PER_MILLION_TOKENS: '0.40',
      },
      db
    );
    const actor = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
    };

    const reservation = await (service as never as {
      reserveDailyBudget: (actor: unknown, tokens: number) => Promise<{ tokens: number; costMicros: number } | null>;
    }).reserveDailyBudget(actor, 1_000);

    expect(reservation).toMatchObject({ tokens: 1_000, costMicros: 400 });
    expect(inserted).toMatchObject({ reservedTokens: 1_000, reservedCostMicros: 400 });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('kullanıcının USD limiti 0 ise ücretli LLM rezervasyonunu reddeder', async () => {
    const insert = vi.fn();
    const db = {
      query: { users: { findFirst: vi.fn(async () => ({ assistantDailyUsdLimitCents: 0 })) } },
      insert,
    };
    const service = await buildService(
      {
        ASSISTANT_LLM_PROVIDER: 'nvidia',
        ASSISTANT_MODEL: 'qwen/qwen3-next-80b-a3b-instruct',
        ASSISTANT_API_KEY: 'test-nvidia-key-123456',
      },
      db
    );

    const reservation = await (service as never as {
      reserveDailyBudget: (actor: unknown, tokens: number) => Promise<unknown>;
    }).reserveDailyBudget({ tenantId: 'tenant', userId: 'user' }, 1_000);

    expect(reservation).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it('NVIDIA NIM OpenAI uyumlu endpointini güvenli CRM ayarlarıyla çağırır', async () => {
    const service = await buildService({
      ASSISTANT_LLM_PROVIDER: 'nvidia',
      ASSISTANT_MODEL: 'qwen/qwen3-next-80b-a3b-instruct',
      ASSISTANT_API_KEY: 'test-nvidia-key-123456',
      ASSISTANT_MAX_TOKENS: '700',
      ASSISTANT_TEMPERATURE: '0.2',
      ASSISTANT_TOP_P: '0.8',
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Bugün 2 kritik takip var.' } }],
          usage: { prompt_tokens: 52, completion_tokens: 11 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await (service as never as { llmAnswer: (m: string, s: unknown[], src: unknown[]) => Promise<unknown> }).llmAnswer(
      'bugünkü kritik işler',
      [],
      []
    );

    expect(result).toEqual({
      text: 'Bugün 2 kritik takip var.',
      usage: { inputTokens: 52, outputTokens: 11 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-nvidia-key-123456');
    expect(init.headers.Accept).toBe('application/json');
    const body = JSON.parse(init.body) as {
      model: string;
      max_tokens: number;
      temperature: number;
      top_p: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body).toMatchObject({
      model: 'qwen/qwen3-next-80b-a3b-instruct',
      max_tokens: 700,
      temperature: 0.2,
      top_p: 0.8,
    });
    expect(body.messages[0]?.content).toContain('Yalnız sağlanan crmData');
    expect(body.messages[1]?.content).toContain('bugünkü kritik işler');
  });

  it('anthropic sağlayıcısı Messages API çağırır ve metni token kullanımıyla döner', async () => {
    const service = await buildService({
      ASSISTANT_LLM_PROVIDER: 'anthropic',
      ASSISTANT_MODEL: 'claude-haiku-4-5',
      ASSISTANT_API_KEY: 'test-anthropic-key-123456',
      ASSISTANT_MAX_TOKENS: '700',
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Bugün 3 iş öne çıkıyor.' }],
          usage: { input_tokens: 42, output_tokens: 17 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await (service as never as { llmAnswer: (m: string, s: unknown[], src: unknown[]) => Promise<unknown> }).llmAnswer(
      'bugün ne var',
      [],
      []
    );

    expect(result).toEqual({
      text: 'Bugün 3 iş öne çıkıyor.',
      usage: { inputTokens: 42, outputTokens: 17 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-anthropic-key-123456');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body) as { model: string; max_tokens: number; system: string; messages: unknown[] };
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(700);
    expect(body.system).toContain('Haksan CRM');
    expect(body.messages).toHaveLength(1);
  });

  it('anthropic hata yanıtında istisna fırlatır (chat deterministik cevaba düşer)', async () => {
    const service = await buildService({
      ASSISTANT_LLM_PROVIDER: 'anthropic',
      ASSISTANT_MODEL: 'claude-haiku-4-5',
      ASSISTANT_API_KEY: 'test-anthropic-key-123456',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));

    await expect(
      (service as never as { llmAnswer: (m: string, s: unknown[], src: unknown[]) => Promise<unknown> }).llmAnswer('soru', [], [])
    ).rejects.toThrow('LLM request failed: 429');
  });

  it('NVIDIA yanıtından yalnız izinli ve doğrulanabilir sekreter planı çıkarır', async () => {
    const service = await buildService({
      ASSISTANT_LLM_PROVIDER: 'nvidia',
      ASSISTANT_MODEL: 'nvidia/nemotron-mini-4b-instruct',
      ASSISTANT_API_KEY: 'test-nvidia-key-123456',
      ASSISTANT_MAX_TOKENS: '700',
    });
    const companyId = '11111111-1111-4111-8111-111111111111';
    const divisionId = '22222222-2222-4222-8222-222222222222';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Teklif taslağını onaya hazırladım.',
                tool_calls: [{
                  function: {
                    name: 'create_quote',
                    arguments: JSON.stringify({ companyId, divisionId, currencyCode: 'USD', validityDays: 30 }),
                  },
                }],
              },
            },
          ],
          usage: { prompt_tokens: 80, completion_tokens: 30 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const actor = {
      userId: '33333333-3333-4333-8333-333333333333',
      tenantId: '44444444-4444-4444-8444-444444444444',
      email: 'user@example.com',
      roles: ['sales'],
      permissions: new Set(['companies.read', 'quotes.create']),
      divisionIds: [divisionId],
      primaryDivisionId: divisionId,
      departmentIds: [],
      primaryDepartmentId: null,
      canViewAllDivisions: false,
      activeDivisionId: divisionId,
      activeDepartmentId: null,
      accessScopes: [],
    };

    const result = await (service as never as {
      llmSecretaryPlan: (...args: unknown[]) => Promise<any>;
    }).llmSecretaryPlan(
      'Acme için CNC teklif oluştur',
      [{ type: 'company', id: companyId, label: 'Acme' }],
      [{ id: divisionId, code: 'cnc', name: 'CNC' }],
      { message: 'Acme için CNC teklif oluştur', context: { page: 'customers', activeDivisionId: divisionId } },
      actor
    );

    expect(result.action).toEqual({
      kind: 'create_quote',
      arguments: { companyId, divisionId, currencyCode: 'USD', validityDays: 30 },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>;
      tool_choice: string;
    };
    expect(body.messages[0]?.content).toContain('yalnız kullanıcıya gösterilecek onay kartı');
    expect(body.messages[1]?.content).toContain(companyId);
    expect(body.tool_choice).toBe('auto');
    expect(body.tools.some((tool) => tool.function.name === 'create_quote')).toBe(true);
    expect(body.tools.some((tool) => tool.function.name === 'send_email')).toBe(false);
  });

  it('deterministik yedek plan iş alanını korur ve uydurma kaynak kimliğini reddeder', async () => {
    const service = await buildService({ ASSISTANT_LLM_PROVIDER: 'none' });
    const companyId = '11111111-1111-4111-8111-111111111111';
    const divisionId = '22222222-2222-4222-8222-222222222222';
    const actor = {
      activeDivisionId: divisionId,
      primaryDivisionId: divisionId,
    };
    const privateService = service as never as {
      fallbackSecretaryPlan: (...args: unknown[]) => any;
      planReferencesAreAllowed: (...args: unknown[]) => boolean;
    };
    const sources = [{ type: 'company', id: companyId, label: 'Acme' }];
    const divisions = [{ id: divisionId, code: 'cnc', name: 'CNC' }];
    const input = { message: 'Acme için CNC teklif oluştur', context: { page: 'customers', activeDivisionId: divisionId } };

    const plan = privateService.fallbackSecretaryPlan(input.message, sources, divisions, input, actor);
    expect(plan).toMatchObject({ kind: 'create_quote', arguments: { companyId, divisionId } });
    expect(privateService.planReferencesAreAllowed(plan, sources, divisions, input)).toBe(true);
    expect(
      privateService.planReferencesAreAllowed(
        { ...plan, arguments: { ...plan.arguments, companyId: '99999999-9999-4999-8999-999999999999' } },
        sources,
        divisions,
        input
      )
    ).toBe(false);
  });

  it('ürün kodunu korur, miktarı çıkarır ve yalnız görünür katalog ürününü plana bağlar', async () => {
    const service = await buildService({ ASSISTANT_LLM_PROVIDER: 'none' });
    const companyId = '11111111-1111-4111-8111-111111111111';
    const divisionId = '22222222-2222-4222-8222-222222222222';
    const productModelId = '55555555-5555-4555-8555-555555555555';
    const privateService = service as never as {
      searchTerms: (message: string) => string[];
      fallbackSecretaryPlan: (...args: unknown[]) => any;
      planReferencesAreAllowed: (...args: unknown[]) => boolean;
    };
    const message = 'Acme için 2 adet VM-2 CNC teklif oluştur, yüzde 5 indirim';
    const sources = [
      { type: 'company', id: companyId, label: 'Acme' },
      { type: 'product_model', id: productModelId, label: 'VM-2 Haksan CNC' },
    ];
    const divisions = [{ id: divisionId, code: 'cnc', name: 'CNC' }];
    const input = { message, context: { page: 'customers', activeDivisionId: divisionId } };
    const actor = { activeDivisionId: divisionId, primaryDivisionId: divisionId };

    expect(privateService.searchTerms(message)).toContain('vm-2');
    const plan = privateService.fallbackSecretaryPlan(message, sources, divisions, input, actor);
    expect(plan.arguments.items).toEqual([{ productModelId, quantity: 2, discountPercent: 5 }]);
    expect(privateService.planReferencesAreAllowed(plan, sources, divisions, input)).toBe(true);
    expect(
      privateService.planReferencesAreAllowed(
        { ...plan, arguments: { ...plan.arguments, items: [{ productModelId: '99999999-9999-4999-8999-999999999999', quantity: 2 }] } },
        sources,
        divisions,
        input
      )
    ).toBe(false);
  });
});
