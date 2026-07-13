#!/usr/bin/env bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git ufw openssl dnsutils fail2ban unattended-upgrades

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

cat >/etc/ssh/sshd_config.d/99-haksan-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
EOF
systemctl reload ssh

cat >/etc/fail2ban/jail.d/haksan-sshd.conf <<'EOF'
[sshd]
enabled = true
mode = aggressive
maxretry = 4
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/haksan
chown -R ubuntu:ubuntu /opt/haksan

cat >/etc/motd <<'EOF'
Haksan EC2 is ready for Docker Compose deployment.
Next steps:
  1. Copy or clone the repo into /opt/haksan
  2. Fill /opt/haksan/.env from .env.example
  3. Run ./deploy.sh
  4. Add domains and run ./deploy.sh --init-ssl
EOF
