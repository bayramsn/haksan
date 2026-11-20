# Haksan Ops AWS/VDS Integration

This directory contains templates only. They do not change AWS by themselves.

## SSM

- Create an SSM document named `HaksanOpsWhitelistedAction` from `ssm-document-haksan-ops.json`.
- Keep `deploy_execute` out of SSM. It requires the local two-step approval state created by `deploy_prepare`.
- Target instances by tags, for example:
  - `App=haksan-crm`
  - `Role=prod`

## IAM

- Start from `iam-policy-ssm-minimum.json`.
- Replace `REGION` and `ACCOUNT_ID`.
- Attach it only to the operator role or Lambda role that must trigger ops actions.
- Do not grant `ssm:SendCommand` on `document/*` or untagged instances.

## Production GitHub OIDC deploy

`github-production-deploy.yml` creates the production-only GitHub OIDC role,
the parameter-constrained `HaksanDeployEcrRelease` SSM document, and permanent
read-only ECR pull access for the EC2 instance role. The trust policy accepts
tokens only from the `bayramsn/haksan` repository's protected `production`
environment; no long-lived AWS key is stored in GitHub and the workflow cannot
send arbitrary shell commands to the instance.

Validate and deploy:

```bash
aws cloudformation validate-template \
  --template-body file://ops/aws/github-production-deploy.yml \
  --region eu-central-1

aws cloudformation deploy \
  --stack-name haksan-production-github-deploy \
  --template-file ops/aws/github-production-deploy.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region eu-central-1 \
  --tags App=haksan-crm Environment=production ManagedBy=cloudformation
```

Before enabling `.github/workflows/deploy-production.yml`, create a GitHub
environment named `production`, require an approver, prevent self-review, and
restrict deployment branches to `main`. The workflow builds immutable images,
waits for ECR scanning, blocks HIGH/CRITICAL findings, takes an offsite database
backup, runs migrations, verifies health endpoints, and automatically restores
the prior API/nginx images on failure.

## CloudWatch and SNS

Recommended alarms:

- EC2 status check failed for 2 consecutive periods.
- Disk usage above 85 percent warning, above 92 percent critical.
- Nginx 5xx or 429 spike from log metric filters.
- Backup age above `OPS_BACKUP_MAX_AGE_HOURS`.

Alarm flow:

1. CloudWatch alarm publishes to SNS.
2. SNS invokes a small Lambda.
3. Lambda sends a Telegram message with the alarm summary and an Ops Console link.
4. Corrective action still requires Ops Console or Telegram action approval.

Do not put Telegram bot tokens in CloudWatch alarm text, Lambda logs, or SNS payloads.
