# Haksan Ops

Isolated server-care-agent for the Haksan CRM/VDS host. It is separate from the CRM frontend and backend. Default posture is monitor-only, approval-required, and deploy-disabled.

## Install

```bash
cd /opt/haksan
bash ops/install.sh
chmod 600 ops/.env
```

Edit `ops/.env` and set at minimum:

- `OPS_CONSOLE_TOKEN`: generate with `openssl rand -hex 32`
- `OPS_HMAC_SECRET`: generate with `openssl rand -hex 32` before enabling actions
- `OPS_PUBLIC_BASE_URL`: production CRM URL

Start locally:

```bash
OPS_CONFIG_FILE=/opt/haksan/ops/.env node ops/server/server.js
```

Install systemd units:

```bash
sudo bash ops/install.sh --systemd
sudo systemctl enable --now haksan-ops.service
sudo systemctl enable --now haksan-ops-monitor.timer
```

Telegram polling is optional:

```bash
sudo systemctl enable --now haksan-ops-telegram.service
```

## Security Model

- The ops server binds only to `127.0.0.1:3900`.
- `ops/.env` is parsed as data, never sourced as shell.
- No arbitrary shell endpoint exists.
- Approved actions are limited to the whitelist in `ops/server/lib/core.js`.
- Telegram approvals require:
  - allowlisted Telegram user id
  - HMAC-signed callback
  - unexpired action
  - pending action status
  - single use by status transition
- Logs, audit entries, Telegram messages, and console responses pass through redaction.

Kill switches:

- `OPS_ENABLED=false`: ops service and timers become inactive.
- `OPS_ACTIONS_ENABLED=false`: approval buttons cannot execute actions.
- `OPS_DEPLOY_ENABLED=false`: deploy actions are disabled.
- `OPS_DRY_RUN=true`: mutating actions are acknowledged but skipped.

## Whitelisted Actions

Read-only:

- `diagnostics`
- `smoke_test`
- `nginx_test`
- `backup_verify`
- `deploy_prepare`

Mutating:

- `nginx_reload`: runs `nginx -t` before reload.
- `restart_nginx`: restarts only the nginx compose service.
- `restart_api`: restarts only the api compose service and verifies `/health/ready`.
- `deploy_execute`: requires a successful, unconsumed, unexpired `deploy_prepare` and a second approval.

Explicitly not supported:

- automatic DB restore
- automatic migration rollback
- automatic file deletion
- firewall changes
- arbitrary shell commands

## Ops Console

Open only from the server or an SSH tunnel:

```bash
ssh -L 3900:127.0.0.1:3900 ubuntu@SERVER
```

Then browse to `http://127.0.0.1:3900/` and enter `OPS_CONSOLE_TOKEN`.

## Telegram

Set:

- `OPS_TELEGRAM_BOT_TOKEN`
- `OPS_TELEGRAM_CHAT_IDS`
- `OPS_TELEGRAM_ALLOWED_USERS`

The bot token and chat ids must stay in `ops/.env` or a protected systemd environment file. They must not be committed, logged, or sent back to the CRM frontend.

## AWS SSM

Use `ops/aws/ssm-document-haksan-ops.json` for emergency remote actions. The SSM document has fixed allowed values and no free-form command parameter. Keep IAM constrained to tagged production instances.

## Rollback and Disable

Disable immediately:

```bash
printf '\nOPS_ENABLED=false\n' | sudo tee -a /opt/haksan/ops/.env
sudo systemctl restart haksan-ops.service haksan-ops-telegram.service
sudo systemctl stop haksan-ops-monitor.timer haksan-ops-daily-report.timer
```

Remove systemd activation:

```bash
sudo systemctl disable --now haksan-ops.service haksan-ops-telegram.service
sudo systemctl disable --now haksan-ops-monitor.timer haksan-ops-daily-report.timer
```

The CRM Docker Compose stack is not stopped by disabling ops.

## Tests

```bash
bash ops/tests/run-tests.sh
```

The test script checks shell syntax, Node syntax, config injection safety, redaction, disabled mutating actions, and deploy execute gating.
