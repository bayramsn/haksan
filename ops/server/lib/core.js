const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { spawnSync } = require('child_process');

const OPS_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_APP_ROOT = path.resolve(OPS_ROOT, '..');
const ACTION_TYPES = new Set([
  'diagnostics',
  'smoke_test',
  'nginx_test',
  'nginx_reload',
  'restart_nginx',
  'restart_api',
  'backup_verify',
  'deploy_prepare',
  'deploy_execute',
]);
const MUTATING_ACTIONS = new Set(['nginx_reload', 'restart_nginx', 'restart_api', 'deploy_execute']);
const READONLY_ACTIONS = new Set(['diagnostics', 'smoke_test', 'nginx_test', 'backup_verify', 'deploy_prepare']);

class OpsError extends Error {
  constructor(message, code = 'OPS_ERROR', status = 400) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
    this.status = status;
  }
}

function trim(value) {
  return String(value || '').trim();
}

function parseEnvFile(file, required = true) {
  const out = {};
  if (!fs.existsSync(file)) {
    if (required) {
      throw new OpsError(`required config file is missing: ${file}`, 'CONFIG_MISSING', 78);
    }
    return out;
  }

  const body = fs.readFileSync(file, 'utf8');
  const lines = body.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      throw new OpsError(`invalid env syntax in ${file}:${index + 1}`, 'CONFIG_INVALID', 78);
    }
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length < 2) {
        throw new OpsError(`unterminated double quote in ${file}:${index + 1}`, 'CONFIG_INVALID', 78);
      }
      value = value.slice(1, -1);
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length < 2) {
        throw new OpsError(`unterminated single quote in ${file}:${index + 1}`, 'CONFIG_INVALID', 78);
      }
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function boolValue(config, key, fallback) {
  const raw = config[key] == null || config[key] === '' ? fallback : config[key];
  if (raw !== 'true' && raw !== 'false') {
    throw new OpsError(`${key} must be true or false`, 'CONFIG_INVALID', 78);
  }
  return raw === 'true';
}

function numberValue(config, key, fallback, min, max) {
  const raw = config[key] == null || config[key] === '' ? String(fallback) : String(config[key]);
  if (!/^\d+$/.test(raw)) {
    throw new OpsError(`${key} must be an integer`, 'CONFIG_INVALID', 78);
  }
  const value = Number(raw);
  if (value < min || value > max) {
    throw new OpsError(`${key} must be between ${min} and ${max}`, 'CONFIG_INVALID', 78);
  }
  return value;
}

function loadConfig(options = {}) {
  const requireOpsEnv = options.requireOpsEnv !== false;
  const opsConfigFile = process.env.OPS_CONFIG_FILE || path.join(OPS_ROOT, '.env');
  const firstOpsEnv = parseEnvFile(opsConfigFile, requireOpsEnv);
  const appRoot = path.resolve(process.env.OPS_APP_ROOT || firstOpsEnv.OPS_APP_ROOT || DEFAULT_APP_ROOT);
  const appEnv = parseEnvFile(path.join(appRoot, '.env'), false);
  const opsEnv = parseEnvFile(opsConfigFile, requireOpsEnv);
  const config = {
    ...appEnv,
    ...opsEnv,
    ...process.env,
    OPS_ROOT,
    OPS_CONFIG_FILE: opsConfigFile,
    APP_ROOT: appRoot,
  };

  config.OPS_ENABLED = String(config.OPS_ENABLED || 'true');
  config.OPS_ACTIONS_ENABLED = String(config.OPS_ACTIONS_ENABLED || 'false');
  config.OPS_DEPLOY_ENABLED = String(config.OPS_DEPLOY_ENABLED || 'false');
  config.OPS_DRY_RUN = String(config.OPS_DRY_RUN || 'false');
  config.OPS_EXECUTOR = String(config.OPS_EXECUTOR || 'local');
  config.OPS_HOST = String(config.OPS_HOST || '127.0.0.1');
  config.OPS_PORT = String(config.OPS_PORT || '3900');
  config.OPS_STATE_DIR = path.resolve(config.OPS_STATE_DIR || path.join(OPS_ROOT, 'state'));
  config.OPS_ENV_FILE = String(config.OPS_ENV_FILE || '.env');
  config.OPS_ACTION_TTL_MINUTES = String(config.OPS_ACTION_TTL_MINUTES || '60');
  config.OPS_ACTION_TIMEOUT_SECONDS = String(config.OPS_ACTION_TIMEOUT_SECONDS || '900');
  config.OPS_AUDIT_MAX_BYTES = String(config.OPS_AUDIT_MAX_BYTES || '5242880');
  config.OPS_LOG_WINDOW_LINES = String(config.OPS_LOG_WINDOW_LINES || '1000');

  boolValue(config, 'OPS_ENABLED', 'true');
  boolValue(config, 'OPS_ACTIONS_ENABLED', 'false');
  boolValue(config, 'OPS_DEPLOY_ENABLED', 'false');
  boolValue(config, 'OPS_DRY_RUN', 'false');
  numberValue(config, 'OPS_PORT', 3900, 1, 65535);
  numberValue(config, 'OPS_ACTION_TTL_MINUTES', 60, 1, 1440);
  numberValue(config, 'OPS_ACTION_TIMEOUT_SECONDS', 900, 10, 7200);
  numberValue(config, 'OPS_AUDIT_MAX_BYTES', 5242880, 1048576, 104857600);

  if (!['local', 'ssm', 'both'].includes(config.OPS_EXECUTOR)) {
    throw new OpsError('OPS_EXECUTOR must be local, ssm, or both', 'CONFIG_INVALID', 78);
  }
  if (config.OPS_ACTIONS_ENABLED === 'true' && trim(config.OPS_HMAC_SECRET).length < 32) {
    throw new OpsError('OPS_HMAC_SECRET must be at least 32 characters when actions are enabled', 'CONFIG_INVALID', 78);
  }
  return config;
}

function statePaths(config) {
  return {
    stateDir: config.OPS_STATE_DIR,
    actionsDir: path.join(config.OPS_STATE_DIR, 'actions'),
    logsDir: path.join(config.OPS_STATE_DIR, 'logs'),
    deployPreparesDir: path.join(config.OPS_STATE_DIR, 'deploy-prepares'),
    auditFile: path.join(config.OPS_STATE_DIR, 'audit.jsonl'),
    healthFile: path.join(config.OPS_STATE_DIR, 'health-latest.json'),
    healthHistoryFile: path.join(config.OPS_STATE_DIR, 'health.jsonl'),
    telegramOffsetFile: path.join(config.OPS_STATE_DIR, 'telegram-offset.json'),
  };
}

function ensureDirs(config) {
  const paths = statePaths(config);
  fs.mkdirSync(paths.actionsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.logsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.deployPreparesDir, { recursive: true, mode: 0o700 });
}

function redactText(input) {
  let value = String(input == null ? '' : input);
  value = value.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  value = value.replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_AWS_KEY]');
  value = value.replace(/\b(sk_live_|sk_test_|sk-proj-|sk-ant-|ghp_|gho_|github_pat_|xoxb-|xoxp-|xapp-)[A-Za-z0-9_\-]{12,}\b/g, '[REDACTED_TOKEN]');
  value = value.replace(/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/g, '[REDACTED_TELEGRAM_TOKEN]');
  value = value.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');
  value = value.replace(/\b(postgres|postgresql|mysql|mongodb|redis):\/\/([^:\s/@]+):([^@\s]+)@/gi, '$1://[REDACTED]@');
  value = value.replace(/((?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|database_url|postgres_password|jwt_[a-z_]*secret)\s*[:=]\s*)(["']?)[^"',\s]+/gi, '$1$2[REDACTED]');
  return value;
}

function safeJson(value) {
  return JSON.parse(redactText(JSON.stringify(value == null ? {} : value)));
}

function rotateFileIfLarge(file, maxBytes) {
  if (!fs.existsSync(file)) return;
  const stat = fs.statSync(file);
  if (stat.size <= maxBytes) return;
  const rotated = `${file}.1`;
  try {
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(file, rotated);
  } catch (error) {
    throw new OpsError(`failed to rotate ${file}: ${error.message}`, 'STATE_WRITE_FAILED', 500);
  }
}

function appendJsonl(config, file, entry) {
  ensureDirs(config);
  rotateFileIfLarge(file, numberValue(config, 'OPS_AUDIT_MAX_BYTES', 5242880, 1048576, 104857600));
  fs.appendFileSync(file, `${JSON.stringify(safeJson(entry))}\n`, { mode: 0o600 });
}

function audit(config, event, payload = {}) {
  const paths = statePaths(config);
  appendJsonl(config, paths.auditFile, {
    ts: new Date().toISOString(),
    event,
    payload,
  });
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(safeJson(data), null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function actionPath(config, id) {
  if (!/^[a-z0-9_]{8,40}$/.test(id)) {
    throw new OpsError('invalid action id', 'INVALID_ACTION_ID', 400);
  }
  return path.join(statePaths(config).actionsDir, `${id}.json`);
}

function listActions(config) {
  ensureDirs(config);
  const dir = statePaths(config).actionsDir;
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  return files
    .map((file) => readJson(path.join(dir, file)))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function readAction(config, id) {
  const action = readJson(actionPath(config, id));
  if (!action) throw new OpsError('action not found', 'ACTION_NOT_FOUND', 404);
  return action;
}

function saveAction(config, action) {
  writeJsonAtomic(actionPath(config, action.id), action);
}

function actionFingerprint(type, source, title) {
  return crypto.createHash('sha256').update(`${type}|${source}|${title}`).digest('hex').slice(0, 32);
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function classifyAction(type) {
  if (type === 'deploy_execute') return 'deploy';
  if (MUTATING_ACTIONS.has(type)) return 'mutating';
  if (READONLY_ACTIONS.has(type)) return 'read-only';
  return 'unknown';
}

function signAction(config, action, decision) {
  const secret = trim(config.OPS_HMAC_SECRET);
  if (secret.length < 32) {
    throw new OpsError('OPS_HMAC_SECRET is not configured', 'HMAC_MISSING', 500);
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${action.id}|${decision}|${action.nonce}|${action.expiresAt}`)
    .digest('hex')
    .slice(0, 24);
}

function callbackData(config, action, decision) {
  const shortDecision = decision === 'approve' ? 'a' : 'r';
  return `ops:${shortDecision}:${action.id}:${signAction(config, action, decision)}`;
}

function publicAction(config, action, includeTokens = false) {
  const out = { ...safeJson(action) };
  delete out.nonce;
  if (
    includeTokens
    && trim(config.OPS_HMAC_SECRET).length >= 32
    && action.status === 'pending'
    && Date.parse(action.expiresAt) > Date.now()
  ) {
    out.approveSig = signAction(config, action, 'approve');
    out.rejectSig = signAction(config, action, 'reject');
  }
  return out;
}

function validateActionAllowed(config, type) {
  if (!ACTION_TYPES.has(type)) {
    throw new OpsError(`action is not whitelisted: ${type}`, 'ACTION_NOT_ALLOWED', 400);
  }
  if ((type === 'deploy_prepare' || type === 'deploy_execute') && config.OPS_DEPLOY_ENABLED !== 'true') {
    throw new OpsError('deploy actions are disabled', 'DEPLOY_DISABLED', 403);
  }
}

function createAction(config, input) {
  validateActionAllowed(config, input.type);
  ensureDirs(config);
  const ttlMinutes = numberValue(config, 'OPS_ACTION_TTL_MINUTES', 60, 1, 1440);
  const now = new Date();
  const fingerprint = actionFingerprint(input.type, input.source || 'manual', input.title || input.type);
  const existing = listActions(config).find((action) => (
    action.status === 'pending'
    && action.fingerprint === fingerprint
    && Date.parse(action.expiresAt) > Date.now()
  ));

  if (existing) {
    existing.lastSeenAt = now.toISOString();
    existing.duplicateCount = Number(existing.duplicateCount || 0) + 1;
    if (input.details) existing.details = redactText(input.details);
    saveAction(config, existing);
    audit(config, 'action_deduped', { actionId: existing.id, type: existing.type });
    return { action: existing, created: false };
  }

  const action = {
    id: randomId('a'),
    type: input.type,
    risk: classifyAction(input.type),
    severity: input.severity || 'info',
    source: input.source || 'manual',
    title: redactText(input.title || input.type),
    details: redactText(input.details || ''),
    status: 'pending',
    prepareId: input.prepareId || null,
    fingerprint,
    nonce: crypto.randomBytes(8).toString('hex'),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString(),
    duplicateCount: 0,
  };
  saveAction(config, action);
  audit(config, 'action_created', { actionId: action.id, type: action.type, source: action.source, severity: action.severity });
  return { action, created: true };
}

function parseTelegramList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function telegramRequest(config, method, payload) {
  const token = trim(config.OPS_TELEGRAM_BOT_TOKEN);
  if (!token) return Promise.resolve({ skipped: true, reason: 'token missing' });
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = https.request({
      method: 'POST',
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: redactText(data) }));
    });
    req.on('error', (error) => resolve({ error: redactText(error.message) }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

async function sendTelegramMessage(config, text, extra = {}) {
  const chatIds = parseTelegramList(config.OPS_TELEGRAM_CHAT_IDS);
  if (!trim(config.OPS_TELEGRAM_BOT_TOKEN) || chatIds.length === 0) {
    return [{ skipped: true, reason: 'telegram not configured' }];
  }
  const safeText = redactText(text).slice(0, 3800);
  const results = [];
  for (const chatId of chatIds) {
    const payload = {
      chat_id: chatId,
      text: safeText,
      disable_web_page_preview: true,
      ...extra,
    };
    results.push(await telegramRequest(config, 'sendMessage', payload));
  }
  return results;
}

async function notifyAction(config, action) {
  if (!trim(config.OPS_TELEGRAM_BOT_TOKEN) || !trim(config.OPS_TELEGRAM_CHAT_IDS)) {
    return [{ skipped: true, reason: 'telegram not configured' }];
  }
  const text = [
    `Haksan Ops: ${action.severity.toUpperCase()} ${action.title}`,
    `Action: ${action.type}`,
    `Risk: ${action.risk}`,
    `ID: ${action.id}`,
    `Expires: ${action.expiresAt}`,
    '',
    action.details || '',
  ].join('\n');
  const extra = {};
  if (trim(config.OPS_HMAC_SECRET).length >= 32 && config.OPS_ACTIONS_ENABLED === 'true') {
    extra.reply_markup = {
      inline_keyboard: [[
        { text: 'Onayla', callback_data: callbackData(config, action, 'approve') },
        { text: 'Reddet', callback_data: callbackData(config, action, 'reject') },
      ]],
    };
  }
  const results = await sendTelegramMessage(config, text, extra);
  audit(config, 'telegram_action_notified', { actionId: action.id, results });
  return results;
}

function snapshot(config, payload) {
  const paths = statePaths(config);
  const entry = {
    ts: new Date().toISOString(),
    ...payload,
  };
  writeJsonAtomic(paths.healthFile, entry);
  appendJsonl(config, paths.healthHistoryFile, entry);
  audit(config, 'health_snapshot', { health: entry.health, ready: entry.ready, diskPct: entry.diskPct });
  return entry;
}

function assertCanRunApprovedAction(config) {
  if (config.OPS_ENABLED !== 'true') {
    throw new OpsError('OPS_ENABLED=false', 'OPS_DISABLED', 403);
  }
  if (config.OPS_ACTIONS_ENABLED !== 'true') {
    throw new OpsError('OPS_ACTIONS_ENABLED=false', 'ACTIONS_DISABLED', 403);
  }
}

function verifyDecision(config, action, decision, sig) {
  if (action.status !== 'pending') {
    throw new OpsError(`action is not pending: ${action.status}`, 'ACTION_NOT_PENDING', 409);
  }
  if (Date.parse(action.expiresAt) <= Date.now()) {
    action.status = 'expired';
    action.completedAt = new Date().toISOString();
    saveAction(config, action);
    throw new OpsError('action token expired', 'ACTION_EXPIRED', 410);
  }
  const expected = signAction(config, action, decision);
  const got = String(sig || '');
  const expectedBuffer = Buffer.from(expected);
  const gotBuffer = Buffer.from(got);
  if (gotBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(gotBuffer, expectedBuffer)) {
    throw new OpsError('invalid action token', 'ACTION_TOKEN_INVALID', 403);
  }
}

function runApprovedAction(config, action, actor) {
  const paths = statePaths(config);
  const logFile = path.join(paths.logsDir, `${action.id}.log`);
  const env = {
    ...process.env,
    OPS_CONFIG_FILE: config.OPS_CONFIG_FILE,
    OPS_APPROVED_ACTION_ID: action.id,
  };
  const startedAt = new Date().toISOString();
  const timeout = numberValue(config, 'OPS_ACTION_TIMEOUT_SECONDS', 900, 10, 7200) * 1000;
  const result = spawnSync(path.join(OPS_ROOT, 'bin', 'run-action.sh'), [action.type, action.id], {
    cwd: config.APP_ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
    timeout,
    shell: false,
  });
  const combined = [
    `started_at=${startedAt}`,
    `actor=${actor || 'unknown'}`,
    `exit_code=${result.status == null ? 'null' : result.status}`,
    '',
    result.stdout || '',
    result.stderr || '',
    result.error ? result.error.message : '',
  ].join('\n');
  fs.writeFileSync(logFile, redactText(combined), { mode: 0o600 });
  action.logFile = logFile;
  action.completedAt = new Date().toISOString();
  if (result.error) {
    action.status = 'failed';
    action.error = redactText(result.error.message);
  } else if (result.status === 0) {
    action.status = 'completed';
  } else {
    action.status = 'failed';
    action.error = `exit ${result.status}`;
  }
  saveAction(config, action);
  audit(config, action.status === 'completed' ? 'action_completed' : 'action_failed', {
    actionId: action.id,
    type: action.type,
    status: action.status,
    error: action.error || null,
  });
  return action;
}

function decideAction(config, id, decision, sig, actor = 'unknown', via = 'api') {
  const action = readAction(config, id);
  verifyDecision(config, action, decision, sig);

  if (decision === 'reject') {
    action.status = 'rejected';
    action.completedAt = new Date().toISOString();
    action.actor = actor;
    action.via = via;
    saveAction(config, action);
    audit(config, 'action_rejected', { actionId: action.id, type: action.type, actor, via });
    return action;
  }

  assertCanRunApprovedAction(config);
  action.status = 'running';
  action.startedAt = new Date().toISOString();
  action.actor = actor;
  action.via = via;
  saveAction(config, action);
  audit(config, 'action_approved', { actionId: action.id, type: action.type, actor, via });
  return runApprovedAction(config, action, actor);
}

function registerDeployPrepare(config, actionId, prepareId, reportFile, status = 'success') {
  const id = prepareId || randomId('prep');
  const record = {
    id,
    actionId: actionId || null,
    status,
    reportFile: reportFile || null,
    consumed: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + numberValue(config, 'OPS_ACTION_TTL_MINUTES', 60, 1, 1440) * 60 * 1000).toISOString(),
  };
  writeJsonAtomic(path.join(statePaths(config).deployPreparesDir, `${id}.json`), record);
  audit(config, 'deploy_prepare_registered', { prepareId: id, actionId, status });
  return record;
}

function readDeployPrepare(config, id) {
  if (!/^[a-zA-Z0-9_.-]{4,80}$/.test(String(id || ''))) {
    throw new OpsError('invalid prepare id', 'INVALID_PREPARE_ID', 400);
  }
  const file = path.join(statePaths(config).deployPreparesDir, `${id}.json`);
  const record = readJson(file);
  if (!record) throw new OpsError('deploy prepare record not found', 'PREPARE_NOT_FOUND', 404);
  return { record, file };
}

function verifyDeployExecute(config, actionId) {
  const action = readAction(config, actionId);
  if (action.type !== 'deploy_execute') {
    throw new OpsError('approved action is not deploy_execute', 'DEPLOY_ACTION_INVALID', 403);
  }
  if (action.status !== 'running') {
    throw new OpsError('deploy_execute must be started by approval server', 'DEPLOY_ACTION_NOT_RUNNING', 403);
  }
  if (!action.prepareId) {
    throw new OpsError('deploy_execute has no prepareId', 'DEPLOY_PREPARE_MISSING', 403);
  }
  const { record } = readDeployPrepare(config, action.prepareId);
  if (record.status !== 'success') {
    throw new OpsError('deploy_prepare was not successful', 'DEPLOY_PREPARE_FAILED', 403);
  }
  if (record.consumed) {
    throw new OpsError('deploy_prepare was already consumed', 'DEPLOY_PREPARE_CONSUMED', 409);
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    throw new OpsError('deploy_prepare expired', 'DEPLOY_PREPARE_EXPIRED', 410);
  }
  return record;
}

function consumeDeployPrepare(config, prepareId, actionId) {
  const { record, file } = readDeployPrepare(config, prepareId);
  if (record.consumed) {
    throw new OpsError('deploy_prepare already consumed', 'DEPLOY_PREPARE_CONSUMED', 409);
  }
  record.consumed = true;
  record.consumedAt = new Date().toISOString();
  record.consumedByActionId = actionId || null;
  writeJsonAtomic(file, record);
  audit(config, 'deploy_prepare_consumed', { prepareId, actionId });
  return record;
}

function getState(config) {
  ensureDirs(config);
  const paths = statePaths(config);
  return {
    config: {
      enabled: config.OPS_ENABLED === 'true',
      actionsEnabled: config.OPS_ACTIONS_ENABLED === 'true',
      deployEnabled: config.OPS_DEPLOY_ENABLED === 'true',
      dryRun: config.OPS_DRY_RUN === 'true',
      executor: config.OPS_EXECUTOR,
      host: config.OPS_HOST,
      port: Number(config.OPS_PORT),
    },
    health: readJson(paths.healthFile, null),
    actions: listActions(config).slice(0, 100).map((action) => publicAction(config, action, true)),
  };
}

function tailFile(file, maxBytes = 65536) {
  if (!fs.existsSync(file)) return '';
  const stat = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const length = Math.min(maxBytes, stat.size);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, Math.max(0, stat.size - length));
    return redactText(buffer.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function validateTelegramUser(config, userId) {
  const allowed = parseTelegramList(config.OPS_TELEGRAM_ALLOWED_USERS);
  if (allowed.length === 0) return false;
  return allowed.includes(String(userId));
}

module.exports = {
  ACTION_TYPES,
  MUTATING_ACTIONS,
  OpsError,
  OPS_ROOT,
  audit,
  callbackData,
  classifyAction,
  consumeDeployPrepare,
  createAction,
  decideAction,
  ensureDirs,
  getState,
  listActions,
  loadConfig,
  notifyAction,
  publicAction,
  readAction,
  readJson,
  redactText,
  registerDeployPrepare,
  sendTelegramMessage,
  snapshot,
  statePaths,
  tailFile,
  telegramRequest,
  validateActionAllowed,
  validateTelegramUser,
  verifyDeployExecute,
};
