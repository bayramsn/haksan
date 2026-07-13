# AWS EC2 Production Deployment Plan

This runbook does not create AWS resources. Run these commands only after the EC2 instance, DNS records, and security group are approved.

## Target Topology

- Region: `eu-central-1`
- One Ubuntu EC2 instance
- Public inbound ports: `22`, `80`, `443`
- Docker Compose services: `nginx`, `api`, `postgres`, `minio`, `minio-init`
- Public domains:
  - `APP_DOMAIN`, for example `crm.example.com`
  - `STORAGE_DOMAIN`, for example `storage.example.com`
- Internal-only services:
  - API: `api:3000`
  - Postgres: `postgres:5432`
  - MinIO: `minio:9000`

## 1. EC2 Base Setup

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw openssl dnsutils fail2ban unattended-upgrades

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so the Docker group takes effect.

## 2. Host Hardening

For new instances, `deploy/aws-user-data.sh` installs Docker, UFW, fail2ban, unattended security upgrades, and a hardened SSH drop-in.

For an already running EC2 host:

```bash
cd /opt/haksan
chmod +x deploy/harden-ec2.sh
sudo SSH_ALLOWED_CIDR="$(echo "$SSH_CLIENT" | awk '{print $1}')/32" deploy/harden-ec2.sh
```

This keeps `80` and `443` public, restricts SSH at UFW, disables password/root SSH login, enables fail2ban, and enables unattended security upgrades. Do not open Postgres, API, or MinIO API ports to the internet.

## 3. Application Directory

```bash
sudo mkdir -p /opt/haksan
sudo chown -R "$USER":"$USER" /opt/haksan
cd /opt/haksan

# Option A: clone your repository
git clone <YOUR_REPO_URL> .

# Option B: copy this working tree to /opt/haksan using your preferred method
```

## 4. Environment File

```bash
cp .env.example .env
nano .env
```

Replace every `CHANGE_ME` and `example.com` value.

Generate secrets:

```bash
openssl rand -hex 32
```

Minimum required values:

```bash
APP_DOMAIN=crm.your-domain.com
STORAGE_DOMAIN=storage.your-domain.com
CERTBOT_EMAIL=admin@your-domain.com
CORS_ORIGINS=https://crm.your-domain.com
COOKIE_DOMAIN=crm.your-domain.com
S3_ENDPOINT=https://storage.your-domain.com
POSTGRES_PASSWORD=<strong secret>
DATABASE_URL=postgres://haksan:<same db password>@postgres:5432/haksan
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
COOKIE_SECRET=<openssl rand -hex 32>
CALL_WEBHOOK_SECRET=<openssl rand -hex 32>
MINIO_ROOT_USER=<strong access key>
MINIO_ROOT_PASSWORD=<strong secret key>
S3_ACCESS_KEY_ID=<same MinIO access key>
S3_SECRET_ACCESS_KEY=<same MinIO secret key>
```

For a temporary `sslip.io` test host, you may use `CERTBOT_EMAIL=none`.

## 5. DNS

Create DNS `A` records pointing to the EC2 public IP:

```text
crm.your-domain.com      A      <EC2_PUBLIC_IP>
storage.your-domain.com  A      <EC2_PUBLIC_IP>
```

Wait until both resolve before requesting SSL:

```bash
dig +short crm.your-domain.com
dig +short storage.your-domain.com
```

## 6. First Deploy

```bash
chmod +x ./deploy.sh
./deploy.sh
```

This builds the Docker images, starts Postgres and MinIO, runs migrations, then starts API and nginx.

## 7. SSL / Certbot

After DNS resolves to the EC2 public IP:

```bash
./deploy.sh --init-ssl
```

Renewal test:

```bash
./deploy.sh --renew-ssl
```

Add automatic renewal:

```bash
crontab -e
```

```cron
17 3 * * * cd /opt/haksan && ./deploy.sh --renew-ssl >> /var/log/haksan-certbot.log 2>&1
```

## 8. Health Checks

```bash
curl -fsS https://crm.your-domain.com/health
curl -fsS https://crm.your-domain.com/health/ready
curl -fsS https://crm.your-domain.com/health/version
```

Run the bundled security smoke test after every deploy:

```bash
chmod +x deploy/security-check.sh
./deploy/security-check.sh
```

`security-check.sh` fails non-zero when production `npm audit --omit=dev` reports any high or critical vulnerabilities.

## 9. Future Deploys

```bash
cd /opt/haksan
git pull --ff-only
./deploy.sh
```

## 10. Operations

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f nginx
docker compose exec postgres pg_isready -U haksan -d haksan
```

Backups are still required before production use. At minimum, schedule encrypted Postgres dumps and copy them off-instance to S3 or another backup target.

Local on-instance Postgres backup:

```bash
chmod +x deploy/backup-postgres.sh
./deploy/backup-postgres.sh
```

Cron example:

```cron
42 2 * * * cd /opt/haksan && ./deploy/backup-postgres.sh >> /opt/haksan/backups/postgres.log 2>&1
```

On-instance backups are not enough by themselves. Copy dumps off the instance for disaster recovery.
