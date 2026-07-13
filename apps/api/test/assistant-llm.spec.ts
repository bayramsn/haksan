import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * llmAnswer sağlayıcı dallarını DB'siz test eder — AssistantService'in
 * yalnızca env + fetch kullanan kısmı çalıştırılır, bağımlılıklar boş geçilir.
 * Env loadEnv() içinde cache'lendiğinden her buildService modül kaydını
 * sıfırlar; dokunulan env anahtarları afterEach'te eski değerine döner.
 */
const touchedEnvKeys = new Map<string, string | undefined>();

async function buildService(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (!touchedEnvKeys.has(key)) touchedEnvKeys.set(key, process.env[key]);
    process.env[key] = value;
  }
  const { AssistantService } = await import('../src/modules/assistant/assistant.service');
  return new AssistantService({} as never, {} as never, {} as never, {} as never);
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
});
