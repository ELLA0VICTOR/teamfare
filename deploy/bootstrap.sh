#!/usr/bin/env bash
# Run as root on the new, dedicated Ubuntu 24.04 deployment VM.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run bootstrap as root.' >&2; exit 1; }
. /etc/os-release
test "$ID" = ubuntu && test "$VERSION_ID" = 24.04 || { echo 'Expected Ubuntu 24.04.' >&2; exit 1; }
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
systemctl enable --now docker
install -d -m 0700 /opt/teamfare /opt/teamfare/shared /opt/teamfare/releases
install -d -o 1000 -g 1000 -m 0700 /opt/teamfare/backups
echo 'Docker and private deployment directories are ready.'
