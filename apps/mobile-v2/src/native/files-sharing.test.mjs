import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('./files.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;

function harness(changeAt) {
  let context = 'account-1/division-1', counter = 0;
  const files = [], shared = [], requests = [];
  const step = async (name) => { if (changeAt === name) context = 'account-2/division-2'; };
  class ScopeChanged extends Error { constructor() { super('Çalışma alanı değişti; işlemi yeni alanda tekrar başlatın.'); } }
  class MockFile {
    constructor(root, name) { this.uri = `${root}/${name}`; this.exists = false; this.size = 0; files.push(this); }
    create() { this.exists = true; }
    writableStream() { return this; }
    delete() { this.exists = false; }
    static async downloadFileAsync(url, target) {
      target.exists = true; target.size = 16;
      await step('download');
      return target;
    }
  }
  const mocks = {
    'expo-document-picker': {}, 'expo-image-picker': {}, 'expo-file-system/legacy': {},
    'expo-file-system': { File: MockFile, Paths: { cache: 'cache' } },
    'expo-crypto': { randomUUID: () => `uuid-${++counter}` },
    'expo-sharing': {
      isAvailableAsync: async () => { await step('availability'); return true; },
      shareAsync: async (uri, options) => { shared.push({ uri, options }); },
    },
    'expo/fetch': { fetch: async (url, options) => {
      requests.push({ url, options });
      await step('fetch');
      return { ok: true, headers: { get: () => '16' }, body: { pipeTo: async (target) => {
        target.size = 16;
        await step('stream');
      } } };
    } },
    '@haksan/shared': { ALLOWED_FILE_EXTENSIONS: [], ALLOWED_MIME_TYPES: [] },
    '@/src/auth/scope': { activeScope: () => ({ divisionId: 'division-1', departmentId: null }) },
    '@/src/api/client': { accessTokenSnapshot: () => 'local-test-token', requestContextKey: () => context, RequestScopeChangedError: ScopeChanged },
    '@/src/api/config': { apiBaseUrl: () => 'https://local-test.invalid/api/v1' },
    '@/src/api/endpoints': { files: { signedDownload: async () => {
      await step('signed');
      return { downloadUrl: '/files/download', filename: 'teklif.pdf', mimeType: 'application/pdf' };
    } } },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in mocks, `Unexpected native dependency: ${name}`);
    return mocks[name];
  }, URL, URLSearchParams });
  return { api: exports, files, shared, requests, ScopeChanged };
}

for (const changeAt of ['fetch', 'stream', 'availability']) {
  test(`sunucu PDF/Excel indirmesinde ${changeAt} sırasında hesap/bölüm değişirse paylaşılmaz ve dosya temizlenir`, async () => {
    const h = harness(changeAt);
    await assert.rejects(h.api.downloadAndShare('/exports/test', 'test.pdf'), h.ScopeChanged);
    assert.equal(h.shared.length, 0);
    assert.ok(h.files.every((file) => !file.exists));
  });
}

for (const changeAt of ['signed', 'download', 'availability']) {
  test(`kayıt dosyasında ${changeAt} sırasında hesap/bölüm değişirse paylaşılmaz ve dosya temizlenir`, async () => {
    const h = harness(changeAt);
    await assert.rejects(h.api.downloadAndShareFile('file-id'), h.ScopeChanged);
    assert.equal(h.shared.length, 0);
    assert.ok(h.files.every((file) => !file.exists));
  });
}

test('aynı adlı eşzamanlı indirmeler farklı dosyalarla normal paylaşılır; PDF/Excel MIME ve filtreleri korunur', async () => {
  const h = harness();
  await Promise.all([
    h.api.getPdfAndShare('/service/form', 'rapor.pdf'),
    h.api.getPdfAndShare('/service/form', 'rapor.pdf'),
    h.api.downloadAndShare('/trade-fairs/export', 'rapor.xlsx', { query: { q: 'Sac & CNC', format: 'xlsx' } }),
    h.api.downloadAndShareFile('file-id'),
    h.api.downloadAndShareFile('file-id'),
  ]);
  assert.equal(h.shared.length, 5);
  assert.equal(new Set(h.shared.map((file) => file.uri)).size, 5);
  assert.equal(h.shared.filter((file) => file.options.UTI === 'com.adobe.pdf').length, 4);
  assert.ok(h.shared.some((file) => file.options.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  const exportRequest = h.requests.find((request) => request.url.includes('trade-fairs'));
  assert.equal(new URL(exportRequest.url).searchParams.get('q'), 'Sac & CNC');
  assert.equal(exportRequest.options.headers['X-Active-Division'], 'division-1');
});
