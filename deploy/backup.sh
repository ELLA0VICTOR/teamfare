#!/bin/sh
set -eu
umask 077
cd /opt/teamfare/current
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose --project-name teamfare --env-file /opt/teamfare/shared/production.env -f compose.yaml -f deploy/compose.production.yaml exec -T teamfare node server/backup.ts /var/lib/teamfare/teamfare.sqlite "/backups/teamfare-$stamp.sqlite"
# Remove local snapshots older than seven days; also keep a secured off-VM copy.
find /opt/teamfare/backups -maxdepth 1 -type f -name 'teamfare-*.sqlite' -mtime +7 -delete
