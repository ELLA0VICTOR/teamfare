#!/usr/bin/env bash
set -euo pipefail
umask 077
release=${1:?Provide release name}
[[ "$release" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$ ]] || exit 1
cd "/opt/teamfare/releases/$release"
test -f /opt/teamfare/shared/initial.sqlite
test ! -e /opt/teamfare/current || { echo 'Initial import is forbidden after first activation.' >&2; exit 1; }
export TEAMFARE_RELEASE="$release"
docker compose --project-name teamfare --env-file /opt/teamfare/shared/production.env -f compose.yaml -f deploy/compose.production.yaml build teamfare
docker compose --project-name teamfare --env-file /opt/teamfare/shared/production.env -f compose.yaml -f deploy/compose.production.yaml create teamfare
docker run --rm --network none --read-only --user 0 --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --security-opt no-new-privileges:true \
  -v teamfare_teamfare-data:/var/lib/teamfare -v /opt/teamfare/shared/initial.sqlite:/initial.sqlite:ro \
  --entrypoint node "teamfare:$release" --input-type=module -e '
    import { existsSync,copyFileSync,chownSync,chmodSync } from "node:fs";
    const target="/var/lib/teamfare/teamfare.sqlite";
    if(existsSync(target))throw new Error("Production database already exists; initial import refused.");
    copyFileSync("/initial.sqlite",target);chmodSync(target,0o600);chownSync(target,1000,1000);
    console.log("Initial account database copied; no existing database was replaced.");
  '
