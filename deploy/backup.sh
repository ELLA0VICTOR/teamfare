#!/bin/sh
set -eu
umask 077
exec 9>/run/teamfare-backup.lock
flock -w 120 9
cd /opt/teamfare/current
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose --project-name teamfare --env-file /opt/teamfare/shared/production.env -f compose.yaml -f deploy/compose.production.yaml exec -T teamfare node server/backup.ts /var/lib/teamfare/teamfare.sqlite "/backups/teamfare-$stamp.sqlite"
if test -f /opt/teamfare/shared/backup-config.json; then
  /usr/bin/python3 /opt/teamfare/current/deploy/offsite.py "/opt/teamfare/backups/teamfare-$stamp.sqlite"
fi
# Remove local snapshots older than seven days; also keep a secured off-VM copy.
find /opt/teamfare/backups -maxdepth 1 -type f -name 'teamfare-*.sqlite' -mtime +7 -delete
