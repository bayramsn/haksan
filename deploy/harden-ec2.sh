#!/usr/bin/env bash
set -euo pipefail

log() { printf '[harden] %s\n' "$*"; }
die() { printf '[harden] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  die "Run with sudo on the EC2 host."
fi

export DEBIAN_FRONTEND=noninteractive

SSH_ALLOWED_CIDR="${SSH_ALLOWED_CIDR:-}"
if [[ -z "$SSH_ALLOWED_CIDR" && -n "${SSH_CLIENT:-}" ]]; then
  SSH_ALLOWED_CIDR="$(awk '{print $1}' <<<"$SSH_CLIENT")/32"
fi

log "installing host security packages"
apt-get update
apt-get install -y fail2ban unattended-upgrades ufw

log "hardening sshd"
install -d -m 0755 /etc/ssh/sshd_config.d
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
sshd -t
systemctl reload ssh

log "configuring fail2ban"
install -d -m 0755 /etc/fail2ban/jail.d
cat >/etc/fail2ban/jail.d/haksan-sshd.conf <<'EOF'
[sshd]
enabled = true
mode = aggressive
maxretry = 4
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban

log "enabling unattended security upgrades"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

log "configuring ufw"
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
if [[ -n "$SSH_ALLOWED_CIDR" ]]; then
  ufw allow from "$SSH_ALLOWED_CIDR" to any port 22 proto tcp
  ufw delete allow OpenSSH >/dev/null 2>&1 || true
  ufw delete allow 22/tcp >/dev/null 2>&1 || true
  log "ssh allowed from $SSH_ALLOWED_CIDR"
else
  ufw allow OpenSSH
  log "SSH_ALLOWED_CIDR not set; ssh remains open in UFW. Keep AWS Security Group restricted."
fi
ufw --force enable

log "done"
