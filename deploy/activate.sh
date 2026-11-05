#!/usr/bin/env bash
# The release is an already-uploaded, immutable directory under /opt/teamfare/releases.
set -euo pipefail
umask 077
release=${1:?Provide the release name}
[[ "$release" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$ ]] || { echo 'Invalid release name.' >&2; exit 1; }
directory="/opt/teamfare/releases/$release"
test -f "$directory/compose.yaml"
test -f /opt/teamfare/shared/production.env
cd "$directory"
export TEAMFARE_RELEASE="$release"
compose=(docker compose --project-name teamfare --env-file /opt/teamfare/shared/production.env -f compose.yaml -f deploy/compose.production.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" build teamfare
if test -L /opt/teamfare/current; then
  /opt/teamfare/current/deploy/backup.sh
  readlink -f /opt/teamfare/current > /opt/teamfare/shared/previous-release
fi
"${compose[@]}" up -d --wait --wait-timeout 120
curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
ln -sfn "$directory" /opt/teamfare/current.next
mv -Tf /opt/teamfare/current.next /opt/teamfare/current
chmod 0700 "$directory/deploy/backup.sh"
install -m 0644 deploy/teamfare-backup.service /etc/systemd/system/teamfare-backup.service
install -m 0644 deploy/teamfare-backup.timer /etc/systemd/system/teamfare-backup.timer
systemctl daemon-reload
systemctl enable --now teamfare-backup.timer
printf '%s\n' "$release" > /opt/teamfare/shared/current-release
echo 'Release is running. Verify public HTTPS and the full account/research journey next.'
