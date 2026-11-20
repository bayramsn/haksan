#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {
  loadConfig,
  redactText,
  sendTelegramMessage,
} = require('../server/lib/core');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  let text = String(args.text || '');
  if (args['text-file']) {
    text = fs.readFileSync(args['text-file'], 'utf8');
  }
  if (args.prefix) {
    text = `${args.prefix}\n\n${text}`;
  }
  if (!text.trim()) {
    throw new Error('--text or --text-file is required');
  }
  const results = await sendTelegramMessage(config, redactText(text));
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[telegram] ${redactText(error.message)}\n`);
  process.exit(1);
});
