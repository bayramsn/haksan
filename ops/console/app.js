'use strict';

const tokenInput = document.getElementById('tokenInput');
const saveTokenBtn = document.getElementById('saveTokenBtn');
const refreshBtn = document.getElementById('refreshBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const statusLine = document.getElementById('statusLine');
const healthGrid = document.getElementById('healthGrid');
const actionsList = document.getElementById('actionsList');
const requestActions = document.getElementById('requestActions');
const logBox = document.getElementById('logBox');

const actionLabels = {
  diagnostics: 'Diagnostics',
  smoke_test: 'Smoke',
  nginx_test: 'Nginx test',
  nginx_reload: 'Nginx reload',
  restart_nginx: 'Restart nginx',
  restart_api: 'Restart API',
  backup_verify: 'Backup verify',
  deploy_prepare: 'Deploy prepare',
};

function getToken() {
  return sessionStorage.getItem('opsConsoleToken') || '';
}

function setToken(value) {
  sessionStorage.setItem('opsConsoleToken', value);
}

function appendLog(text) {
  const stamp = new Date().toISOString();
  logBox.textContent = `${stamp} ${text}\n${logBox.textContent}`.slice(0, 100000);
}

async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Ops-Token': token,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function metric(label, value) {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value == null || value === '' ? '-' : String(value);
  healthGrid.append(dt, dd);
}

function renderHealth(state) {
  clearNode(healthGrid);
  const cfg = state.config || {};
  const health = state.health || {};
  metric('Enabled', cfg.enabled ? 'yes' : 'no');
  metric('Actions', cfg.actionsEnabled ? 'enabled' : 'disabled');
  metric('Deploy', cfg.deployEnabled ? 'enabled' : 'disabled');
  metric('Dry run', cfg.dryRun ? 'yes' : 'no');
  metric('Health', health.health);
  metric('Ready', health.ready);
  metric('Disk', health.diskPct == null ? null : `${health.diskPct}%`);
  metric('API errors', health.apiErrors);
  metric('Nginx errors', health.nginxErrors);
  metric('Backup age', health.backupAgeHours == null ? null : `${health.backupAgeHours}h`);
}

function button(label, className, onClick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  if (className) item.className = className;
  item.addEventListener('click', onClick);
  return item;
}

async function requestAction(type) {
  const label = actionLabels[type] || type;
  const payload = {
    type,
    severity: type.startsWith('restart') || type === 'nginx_reload' ? 'warning' : 'info',
    title: label,
    details: `Requested from Ops Console at ${new Date().toISOString()}`,
  };
  const result = await api('/api/actions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  appendLog(`created action ${result.action.id} ${result.action.type}`);
  await loadState();
}

function renderRequestButtons(state) {
  clearNode(requestActions);
  const cfg = state.config || {};
  ['diagnostics', 'smoke_test', 'nginx_test', 'nginx_reload', 'restart_nginx', 'restart_api', 'backup_verify']
    .forEach((type) => requestActions.appendChild(button(actionLabels[type], '', () => requestAction(type).catch((error) => appendLog(error.message)))));
  if (cfg.deployEnabled) {
    requestActions.appendChild(button(actionLabels.deploy_prepare, 'primary', () => requestAction('deploy_prepare').catch((error) => appendLog(error.message))));
  }
}

async function decide(action, decision) {
  const sig = decision === 'approve' ? action.approveSig : action.rejectSig;
  if (!sig) {
    appendLog(`missing ${decision} token for ${action.id}`);
    return;
  }
  const result = await api(`/api/actions/${action.id}/${decision === 'approve' ? 'approve' : 'reject'}`, {
    method: 'POST',
    body: JSON.stringify({ sig }),
  });
  appendLog(`${decision} ${action.id}: ${result.action.status}`);
  await loadState();
}

async function showLog(action) {
  const response = await fetch(`/api/actions/${action.id}/log`, {
    headers: { 'X-Ops-Token': getToken() },
  });
  if (!response.ok) throw new Error(`log HTTP ${response.status}`);
  logBox.textContent = await response.text();
}

function renderActions(actions) {
  clearNode(actionsList);
  if (!actions.length) {
    const empty = document.createElement('p');
    empty.className = 'meta';
    empty.textContent = 'No actions';
    actionsList.appendChild(empty);
    return;
  }

  actions.forEach((action) => {
    const card = document.createElement('article');
    card.className = 'action-card';

    const header = document.createElement('header');
    const left = document.createElement('div');
    const title = document.createElement('div');
    const meta = document.createElement('div');
    const badge = document.createElement('span');

    title.className = 'title';
    title.textContent = action.title || action.type;
    meta.className = 'meta';
    meta.textContent = `${action.type} · ${action.risk} · ${action.severity} · ${action.id}`;
    badge.className = `badge ${action.status}`;
    badge.textContent = action.status;

    left.append(title, meta);
    header.append(left, badge);

    const details = document.createElement('div');
    details.className = 'details';
    details.textContent = action.details || '';

    const actions = document.createElement('div');
    actions.className = 'actions';
    if (action.status === 'pending') {
      actions.appendChild(button('Approve', 'primary', () => decide(action, 'approve').catch((error) => appendLog(error.message))));
      actions.appendChild(button('Reject', 'danger', () => decide(action, 'reject').catch((error) => appendLog(error.message))));
    }
    actions.appendChild(button('Log', '', () => showLog(action).catch((error) => appendLog(error.message))));

    card.append(header, details, actions);
    actionsList.appendChild(card);
  });
}

async function loadState() {
  try {
    const state = await api('/api/state');
    statusLine.textContent = `Connected · ${state.config.host}:${state.config.port}`;
    renderHealth(state);
    renderRequestButtons(state);
    renderActions(state.actions || []);
  } catch (error) {
    statusLine.textContent = error.message;
    appendLog(error.message);
  }
}

saveTokenBtn.addEventListener('click', () => {
  setToken(tokenInput.value.trim());
  loadState();
});

refreshBtn.addEventListener('click', () => {
  loadState();
});

clearLogBtn.addEventListener('click', () => {
  logBox.textContent = '';
});

tokenInput.value = getToken();
loadState();
setInterval(loadState, 30000);
