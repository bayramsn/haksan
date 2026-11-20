#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const {
  OpsError,
  createAction,
  decideAction,
  getState,
  loadConfig,
  publicAction,
  readAction,
  redactText,
  statePaths,
  tailFile,
} = require('./lib/core');

const CONSOLE_DIR = path.resolve(__dirname, '..', 'console');
const rateBuckets = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function securityHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extra,
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendText(res, status, text) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) {
        reject(new OpsError('request body too large', 'BODY_TOO_LARGE', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new OpsError('invalid json body', 'INVALID_JSON', 400));
      }
    });
    req.on('error', reject);
  });
}

function tokenFromRequest(req, url) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.headers['x-ops-token']) return req.headers['x-ops-token'];
  return '';
}

function requireAuth(config, req, url) {
  const expected = String(config.OPS_CONSOLE_TOKEN || '');
  if (expected.length < 32) {
    throw new OpsError('OPS_CONSOLE_TOKEN must be at least 32 characters', 'CONSOLE_TOKEN_MISSING', 500);
  }
  if (!safeEqual(tokenFromRequest(req, url), expected)) {
    throw new OpsError('unauthorized', 'UNAUTHORIZED', 401);
  }
}

function enforceRateLimit(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 120;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > max) {
    throw new OpsError('rate limit exceeded', 'RATE_LIMITED', 429);
  }
}

function serveStatic(res, requestPath) {
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(CONSOLE_DIR, relative);
  if (!file.startsWith(CONSOLE_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendText(res, 404, 'not found');
    return;
  }
  res.writeHead(200, securityHeaders({ 'Content-Type': contentType(file) }));
  fs.createReadStream(file).pipe(res);
}

async function handleApi(config, req, res, url) {
  requireAuth(config, req, url);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, getState(config));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/actions') {
    sendJson(res, 200, getState(config).actions);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/actions') {
    const body = await readBody(req);
    const result = createAction(config, {
      type: body.type,
      severity: body.severity || 'info',
      source: 'console',
      title: body.title || body.type,
      details: body.details || '',
    });
    sendJson(res, 201, { created: result.created, action: publicAction(config, result.action, true) });
    return;
  }

  const approveMatch = url.pathname.match(/^\/api\/actions\/([a-z0-9_]{8,40})\/approve$/);
  if (req.method === 'POST' && approveMatch) {
    const body = await readBody(req);
    const action = decideAction(config, approveMatch[1], 'approve', body.sig, 'console', 'ops-console');
    sendJson(res, 200, { action: publicAction(config, action, false) });
    return;
  }

  const rejectMatch = url.pathname.match(/^\/api\/actions\/([a-z0-9_]{8,40})\/reject$/);
  if (req.method === 'POST' && rejectMatch) {
    const body = await readBody(req);
    const action = decideAction(config, rejectMatch[1], 'reject', body.sig, 'console', 'ops-console');
    sendJson(res, 200, { action: publicAction(config, action, false) });
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/([a-z0-9_]{8,40})$/);
  if (req.method === 'GET' && actionMatch) {
    sendJson(res, 200, publicAction(config, readAction(config, actionMatch[1]), true));
    return;
  }

  const logMatch = url.pathname.match(/^\/api\/actions\/([a-z0-9_]{8,40})\/log$/);
  if (req.method === 'GET' && logMatch) {
    const action = readAction(config, logMatch[1]);
    const logPath = action.logFile || path.join(statePaths(config).logsDir, `${action.id}.log`);
    sendText(res, 200, tailFile(logPath));
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

async function main() {
  const config = loadConfig();
  if (config.OPS_ENABLED !== 'true') {
    process.stdout.write('[ops-server] OPS_ENABLED=false; service inactive\n');
    return;
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.OPS_HOST)) {
    throw new OpsError('OPS_HOST must be loopback only', 'HOST_NOT_LOOPBACK', 78);
  }
  if (String(config.OPS_CONSOLE_TOKEN || '').length < 32) {
    throw new OpsError('OPS_CONSOLE_TOKEN must be at least 32 characters', 'CONSOLE_TOKEN_MISSING', 78);
  }

  const server = http.createServer(async (req, res) => {
    try {
      enforceRateLimit(req);
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await handleApi(config, req, res, url);
        return;
      }
      serveStatic(res, url.pathname);
    } catch (error) {
      const status = Number(error.status || 500);
      sendJson(res, status, { error: error.code || 'OPS_ERROR', message: redactText(error.message) });
    }
  });

  server.listen(Number(config.OPS_PORT), config.OPS_HOST, () => {
    process.stdout.write(`[ops-server] listening on ${config.OPS_HOST}:${config.OPS_PORT}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`[ops-server] ${redactText(error.message)}\n`);
  process.exit(error.status ? Number(error.status) : 1);
});
