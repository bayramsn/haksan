const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = createRequire(path.resolve(__dirname, '../../../../package.json'))('typescript');

function load(source, dependencies, globals = {}) {
  const output = ts.transpileModule(readFileSync(path.join(__dirname, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandbox = {
    exports: {}, URL, Uint8Array, Error, AbortController, setTimeout, clearTimeout,
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  };
  vm.runInNewContext(output.outputText, sandbox, { filename: source });
  return sandbox.exports;
}

function authClient() {
  const responses = [];
  const calls = [];
  let origin = 'https://crm.example';
  let originHandler;
  const storage = new Map();
  const client = load('apiClient.ts', {
    'expo-secure-store': {
      setItemAsync: async (key, value) => storage.set(key, value),
      deleteItemAsync: async (key) => storage.delete(key),
      getItemAsync: async (key) => storage.get(key) ?? null,
    },
    './config': {
      getApiBaseUrl: () => `${origin}/api/v1`,
      apiBaseOrigin: () => origin,
      setApiOriginChangedHandler: (handler) => { originHandler = handler; },
    },
  }, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const response = responses.shift();
      assert.ok(response, 'Unexpected network request');
      return typeof response === 'function' ? response() : response;
    },
  });
  return { client, responses, calls, changeOrigin: async (value) => {
    const previous = origin;
    await originHandler(previous, value);
    origin = value;
  } };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('binary PDF refreshes expired access token and preserves active scope', async () => {
  const { client, responses, calls } = authClient();
  await client.setAccessToken('expired');
  await client.setRefreshCookie('haksan_rt=old');
  await client.setActiveDivision('division-1');
  await client.setActiveDepartment('department-1');
  responses.push(json({}, 401));
  responses.push(json({ accessToken: 'fresh' }, 200, { 'set-cookie': 'haksan_rt=rotated; HttpOnly' }));
  responses.push(new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }));
  const response = await client.apiBinaryRequest('/quotes/id/generate-pdf', 'POST');
  assert.equal(await response.text(), '%PDF-1.7');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.method, 'POST');
  assert.equal(calls[2].init.headers.Authorization, 'Bearer fresh');
  assert.equal(calls[2].init.headers.Cookie, 'haksan_rt=rotated');
  assert.equal(calls[2].init.headers['X-Active-Division'], 'division-1');
  assert.equal(calls[2].init.headers['X-Active-Department'], 'department-1');
});

test('binary requests reject different origins before sending credentials', async () => {
  const { client, calls } = authClient();
  await client.setAccessToken('private');
  await assert.rejects(client.apiBinaryRequest('https://external.example/file'), error => error.code === 'UNTRUSTED_API_ORIGIN');
  assert.equal(calls.length, 0);
});

test('server requirement blockers survive binary errors', async () => {
  const { client, responses } = authClient();
  responses.push(json({ error: { code: 'QUOTE_REQUIREMENTS_INCOMPLETE', message: 'Eksikler var', details: { blockers: ['contact'] } } }, 422));
  await assert.rejects(client.apiBinaryRequest('/quotes/id/generate-pdf', 'POST'), error =>
    error.status === 422 && error.code === 'QUOTE_REQUIREMENTS_INCOMPLETE' && error.details.blockers[0] === 'contact');
});

test('changing CRM origin clears credentials before subsequent binary requests', async () => {
  const { client, responses, calls, changeOrigin } = authClient();
  await client.setAccessToken('private');
  await client.setRefreshCookie('haksan_rt=private');
  await changeOrigin('https://other-crm.example');
  responses.push(new Response('file'));
  await client.apiBinaryRequest('/files/id/content');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Cookie, undefined);
});

function downloads() {
  const files = [];
  const shares = [];
  const calls = [];
  let response;
  let signed;
  class MockFile {
    constructor(_, filename) { this.uri = `file:///cache/${filename}`; this.exists = false; files.push(this); }
    create() { this.exists = true; }
    write(bytes) { this.bytes = bytes; }
    delete() { this.exists = false; }
  }
  const client = load('download.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system': { File: MockFile, Paths: { cache: '/cache' } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (uri, options) => shares.push({ uri, options }) },
    './apiClient': {
      api: { post: async () => signed },
      apiBinaryRequest: async (...args) => { calls.push(args); return response; },
    },
    './config': { apiBaseOrigin: () => 'https://crm.example', getApiBaseUrl: () => 'https://crm.example/api/v1' },
  }, {
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
  });
  return { client, files, shares, calls, setResponse: (value) => { response = value; }, setSigned: (value) => { signed = value; } };
}

test('native PDF sharing receives real file bytes and deletes its temporary file', async () => {
  const { client, files, shares, setResponse } = downloads();
  setResponse(new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="quote.pdf"' } }));
  await client.openPdfUrl('/quotes/id/generate-pdf');
  assert.equal(shares.length, 1);
  assert.ok(shares[0].uri.startsWith('file:///'));
  assert.equal(shares[0].options.mimeType, 'application/pdf');
  assert.equal(shares[0].options.UTI, 'com.adobe.pdf');
  assert.equal(Buffer.from(files[0].bytes).toString(), '%PDF-1.7');
  assert.equal(files[0].exists, false);
});

test('selected Excel export sends filter body through authenticated POST', async () => {
  const { client, calls, setResponse } = downloads();
  setResponse(new Response('xlsx', { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }));
  const body = { ids: ['selected-id'] };
  await client.openExportUrl('/exports/opportunities/selected', body);
  assert.equal(calls[0][1], 'POST');
  assert.equal(calls[0][2], body);
});

test('oversized and non-document responses never reach native sharing', async () => {
  const { client, shares, setResponse } = downloads();
  setResponse(new Response('x', { headers: { 'content-length': String(26 * 1024 * 1024) } }));
  await assert.rejects(client.openExportUrl('/exports/report'), /25 MB/);
  setResponse(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(client.openPdfUrl('/quotes/id/generate-pdf'), /beklenmeyen/);
  assert.equal(shares.length, 0);
});

test('signed external HTTPS downloads omit all CRM credentials', async () => {
  const { client, calls, setSigned, setResponse } = downloads();
  setSigned({ downloadUrl: 'https://bucket.example/file?signature=capability', filename: 'file.pdf' });
  setResponse(new Response('%PDF-file', { headers: { 'content-type': 'application/pdf' } }));
  await client.openStoredFile('file-id');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers, undefined);
});

test('signed external HTTP URLs are rejected before download', async () => {
  const { client, calls, setSigned } = downloads();
  setSigned({ downloadUrl: 'http://bucket.example/file', filename: 'file.pdf' });
  await assert.rejects(client.openStoredFile('file-id'), /Güvenli/);
  assert.equal(calls.length, 0);
});
