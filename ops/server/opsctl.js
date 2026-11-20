#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {
  audit,
  consumeDeployPrepare,
  createAction,
  getState,
  listActions,
  loadConfig,
  notifyAction,
  publicAction,
  readAction,
  redactText,
  registerDeployPrepare,
  snapshot,
  statePaths,
  tailFile,
  verifyDeployExecute,
} = require('./lib/core');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function jsonArg(value, fallback = {}) {
  if (!value) return fallback;
  return JSON.parse(value);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'redact') {
    process.stdout.write(redactText(readStdin()));
    return;
  }

  const config = loadConfig();

  switch (command) {
    case 'audit': {
      if (!args.event) throw new Error('--event is required');
      audit(config, args.event, jsonArg(args['payload-json']));
      break;
    }
    case 'snapshot': {
      const entry = snapshot(config, jsonArg(args['payload-json']));
      printJson(entry);
      break;
    }
    case 'create-action': {
      const result = createAction(config, {
        type: args.type,
        severity: args.severity,
        source: args.source,
        title: args.title,
        details: args.details,
        prepareId: args['prepare-id'],
      });
      if (args.notify) await notifyAction(config, result.action);
      printJson({ created: result.created, action: publicAction(config, result.action, true) });
      break;
    }
    case 'list-actions': {
      printJson(listActions(config).map((action) => publicAction(config, action, true)));
      break;
    }
    case 'show-action': {
      if (!args.id) throw new Error('--id is required');
      printJson(publicAction(config, readAction(config, args.id), true));
      break;
    }
    case 'state': {
      printJson(getState(config));
      break;
    }
    case 'action-log': {
      if (!args.id) throw new Error('--id is required');
      const action = readAction(config, args.id);
      process.stdout.write(tailFile(action.logFile || `${statePaths(config).logsDir}/${args.id}.log`));
      break;
    }
    case 'register-prepare': {
      const record = registerDeployPrepare(
        config,
        args['action-id'],
        args['prepare-id'],
        args['report-file'],
        args.status || 'success',
      );
      printJson(record);
      break;
    }
    case 'verify-deploy-execute': {
      if (!args['action-id']) throw new Error('--action-id is required');
      const record = verifyDeployExecute(config, args['action-id']);
      printJson(record);
      break;
    }
    case 'consume-prepare': {
      if (!args['prepare-id']) throw new Error('--prepare-id is required');
      const record = consumeDeployPrepare(config, args['prepare-id'], args['action-id']);
      printJson(record);
      break;
    }
    case 'retention': {
      audit(config, 'retention_checked', {});
      printJson({ ok: true });
      break;
    }
    default:
      throw new Error(`unknown command: ${command || '(empty)'}`);
  }
}

main().catch((error) => {
  const status = error.status
    ? Number(error.status)
    : (error.code === 'CONFIG_MISSING' || error.code === 'CONFIG_INVALID' ? 78 : 1);
  process.stderr.write(`[opsctl] ${redactText(error.message)}\n`);
  process.exit(status);
});
