#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {
  audit,
  decideAction,
  loadConfig,
  readJson,
  redactText,
  sendTelegramMessage,
  statePaths,
  telegramRequest,
  validateTelegramUser,
} = require('../server/lib/core');

function parseCallbackData(data) {
  const match = String(data || '').match(/^ops:([ar]):([a-z0-9_]{8,40}):([a-f0-9]{24})$/);
  if (!match) return null;
  return {
    decision: match[1] === 'a' ? 'approve' : 'reject',
    actionId: match[2],
    sig: match[3],
  };
}

async function answerCallback(config, callbackId, text) {
  if (!callbackId) return;
  await telegramRequest(config, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: redactText(text).slice(0, 180),
    show_alert: false,
  });
}

function getOffset(config) {
  return Number(readJson(statePaths(config).telegramOffsetFile, { offset: 0 }).offset || 0);
}

function setOffset(config, offset) {
  fs.writeFileSync(statePaths(config).telegramOffsetFile, `${JSON.stringify({ offset })}\n`, { mode: 0o600 });
}

async function handleUpdate(config, update) {
  const callback = update.callback_query;
  if (!callback) return;
  const userId = callback.from && callback.from.id;
  const chatId = callback.message && callback.message.chat && callback.message.chat.id;
  const parsed = parseCallbackData(callback.data);

  if (!parsed) {
    await answerCallback(config, callback.id, 'Unknown action');
    return;
  }

  if (!validateTelegramUser(config, userId)) {
    audit(config, 'telegram_denied', { userId, actionId: parsed.actionId, decision: parsed.decision });
    await answerCallback(config, callback.id, 'Not allowed');
    return;
  }

  try {
    const action = decideAction(config, parsed.actionId, parsed.decision, parsed.sig, `telegram:${userId}`, 'telegram');
    await answerCallback(config, callback.id, `${parsed.decision}: ${action.status}`);
    if (chatId) {
      await sendTelegramMessage(config, `Haksan Ops action ${action.id}: ${action.status}`);
    }
  } catch (error) {
    audit(config, 'telegram_action_failed', { userId, actionId: parsed.actionId, error: error.message });
    await answerCallback(config, callback.id, error.message);
  }
}

async function pollOnce(config) {
  const offset = getOffset(config);
  const response = await telegramRequest(config, 'getUpdates', {
    offset,
    timeout: 20,
    allowed_updates: ['callback_query'],
  });
  if (response.error || !response.body) {
    process.stderr.write(`[telegram-poll] ${redactText(response.error || 'empty response')}\n`);
    return;
  }
  const body = JSON.parse(response.body);
  if (!body.ok) {
    process.stderr.write(`[telegram-poll] Telegram returned not ok\n`);
    return;
  }
  for (const update of body.result || []) {
    await handleUpdate(config, update);
    setOffset(config, Number(update.update_id) + 1);
  }
}

async function main() {
  const config = loadConfig();
  if (config.OPS_ENABLED !== 'true') {
    process.stdout.write('[telegram-poll] OPS_ENABLED=false; polling inactive\n');
    return;
  }
  if (!config.OPS_TELEGRAM_BOT_TOKEN || !config.OPS_TELEGRAM_ALLOWED_USERS) {
    process.stdout.write('[telegram-poll] telegram token or allowlist missing; polling inactive\n');
    return;
  }

  const interval = Math.max(1000, Number(config.OPS_TELEGRAM_POLL_INTERVAL_MS || 2500));
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });

  while (!stopping) {
    try {
      await pollOnce(config);
    } catch (error) {
      process.stderr.write(`[telegram-poll] ${redactText(error.message)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

main().catch((error) => {
  process.stderr.write(`[telegram-poll] ${redactText(error.message)}\n`);
  process.exit(1);
});
