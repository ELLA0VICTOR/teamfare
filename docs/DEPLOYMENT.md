# Vultr deployment

Live: [https://teamfare.dixmail.xyz](https://teamfare.dixmail.xyz), deployed 4 November 2026. The web app, Node API and SQLite data run on one dedicated Vultr Ubuntu 24.04 VM in London: 1 vCPU, 2 GB RAM, `vc2-1c-2gb`, quoted by the API at $10/month before any credits or additional usage. Vultr Inference, Tavily and Resend remain external services called only by the API.

Latest status, 5 November: the full workflow release below is live, with automatic encrypted offsite storage ($6/month) and independent uptime checks active. VM plus storage totals $16/month before usage. Earlier dated verification sections are historical records; see **Full workflow and resilience release** for current results and recovery instructions.

## Access and initial provisioning

1. Enable general Vultr API access and allow this workstation's current public IP. Put the management secret in local `.env` as `VULTR_API_KEY`; it is separate from the Inference key. It is never copied into the runtime environment or release archive.
2. Run `node deploy/vultr.mjs inspect`. This reads current compute prices, OS images, regional capacity and existing instance metadata. It does not create infrastructure.
3. `node deploy/vultr.mjs create` provisions one instance after access is configured. It selects a 2–4 GB, at most 2-vCPU plan costing at most $20/month from available capacity, preferring London. The actual API quote is reported before provisioning. No paid backup/DDoS add-ons are requested. Resource IDs are stored locally in ignored `.artifacts/deploy/vultr.json` to resume without creating duplicate VMs.
4. The provisioner creates a dedicated SSH key and firewall. SSH is restricted to this workstation's IPv4; HTTP/HTTPS are public. Password SSH authentication is disabled. The private key stays under ignored `.artifacts/deploy/`; keep this directory private. Use a dedicated known-hosts file and `StrictHostKeyChecking=accept-new`; never disable host-key checking.

If the workstation IP changes, update API Access Control and the deployment firewall's SSH rule from the Vultr console. Do not expose the API port 3001 publicly.

## Build and upload

`node deploy/prepare.mjs` creates `.artifacts/deploy/teamfare-release.tar.gz`, a SHA-256 manifest, and a **separate private** `production.env`. It includes only required source/configuration/assets; no runtime databases, test inboxes, test providers, environment files or keys enter the archive. A new production auth secret is generated once and preserved on repeated preparation. Runtime credentials follow an explicit allowlist; the Vultr management key is excluded.

Use SSH/SCP to the recorded VM IP. Run `deploy/bootstrap.sh` as root on the new dedicated VM. It installs Docker from Docker's signed Ubuntu repository and prepares:

- `/opt/teamfare/releases/RELEASE` — immutable source releases.
- `/opt/teamfare/shared/production.env` — root-owned mode 0600 runtime settings.
- `/opt/teamfare/backups` — mode 0700, owned by UID 1000 for backup writes.
- `/opt/teamfare/current` — symlink to the activated release.

Upload and extract the archive into a new release directory, verify its SHA-256 against the local manifest, and copy the runtime environment separately. Do not put secrets in Cloud-Init, shell arguments, build arguments, logs or Git. Set shell scripts executable before invoking them.

## Initial data

The user has an existing local team account. Preserve it using `node deploy/initial-data.mjs`, which creates a consistent SQLite backup under `.artifacts/deploy/initial.sqlite`. The copy clears old sessions, pending proofs and local throttle counters; passwords and team data are retained. The live local database is not modified.

Upload that private snapshot to `/opt/teamfare/shared/initial.sqlite`, mode 0600, and run `deploy/import-initial.sh RELEASE` **before first activation**. It refuses to run after a current release exists or overwrite a database already present in the production volume. Never use initial import as a redeployment mechanism.

## DNS, HTTPS and activation

In Namecheap Advanced DNS, add an **A record** with host **teamfare**, value **the new VM's IPv4**, and automatic TTL. Preserve the existing MX/TXT/DKIM/SPF records used by Resend. Do not add an AAAA record unless IPv6 is configured and tested. Verify public DNS points to the new VM.

Run `deploy/activate.sh RELEASE`. It validates Compose, builds the image, backs up an existing deployment, starts the stack with health checks, and activates the symlink only after the app is healthy. Production Compose uses Caddy for public TLS, a nonroot/read-only app container, persistent SQLite and certificate volumes, capped logs, memory/process limits and graceful shutdown. Only Caddy publishes public ports. The host's API bind is loopback-only.

Cloud-init and Docker installation must finish before activation. No public deployment should be reported complete until DNS, a publicly trusted certificate and the full workflow have been checked.

## Backups and recovery

Activation installs `teamfare-backup.timer`: daily at 03:00 UTC (04:00 Lagos) with a small random delay. The backup command uses Node SQLite's online backup API, validates `PRAGMA integrity_check`, publishes the finished file atomically, and refuses existing destinations. It removes local snapshots older than seven days. Run `/opt/teamfare/current/deploy/backup.sh` manually after first deployment and before updates.

Local VM backups do not survive loss of the VM/disk. Copy a protected snapshot off the VM with SCP and keep its permissions private. Test restoration on an isolated database before relying on it; never overwrite a running production database. For a real restore, stop the app, retain the current database/WAL files as a recovery copy, restore the chosen consistent snapshot with UID 1000 ownership/mode 0600, and restart. Do not mix a restored database with WAL files from another version of it.

Release images and old release directories are retained for rollback. `/opt/teamfare/shared/previous-release` records the previous source directory. Rolling back application code does not reverse a database migration. Review schema compatibility and use the pre-deployment snapshot if a deliberate data rollback is required; do not discard newer writes automatically.

## Verification status

Locally completed: Docker production build, production Compose validation, HTTPS reverse proxy preflight, desktop/mobile browser checks, private API access denial, nonroot runtime, exclusion of secrets/test files, online backup integrity/restore, and persistence across a container restart. The initial-data import was also tested with UID 1000/mode 0600, retained the local account, removed old sessions, and rejected an overwrite. The TLS preflight uses an isolated local certificate; it is not proof of a public certificate. Unit/API checks and the existing account/research/browser journeys remain available.

Completed on Vultr on 4 November 2026:

- VM provisioning, key-only SSH, source-IP-restricted SSH firewall, public HTTP/HTTPS, and API port 3001 bound only to loopback.
- Public A record verified through Cloudflare and Google DNS; ordinary Windows Node HTTPS returned 200 with normal certificate validation. HTTP redirects to HTTPS. The live browser check also verified the publicly trusted certificate, CSP, HSTS and private API denial.
- Initial import retained the original team/account/password hash and cleared copied local sessions. Runtime UID 1000, directory mode 0700 and database mode 0600 were checked. The management API key, environment file and test providers are absent from the app image.
- Actual signup and invited teammate verification emails, secure session cookies, real Vultr/Tavily research, three source-backed options, draft selection, manager change request, resubmission, separate-manager approval, RSVP, expense recording and formula-safe CSV export.
- Session, RSVP and expense persistence across a real deployed-container restart, followed by fresh password-plus-email-code sign-in. Desktop and 390px research/plan screenshots were reviewed; no horizontal overflow or browser page errors were observed.
- Temporary verification teams were removed by exact ID/name/member checks, leaving the original account intact. The backup service completed successfully and the daily timer is active. A post-cleanup snapshot was downloaded off the VM and restored into an isolated writable SQLite copy; integrity, foreign keys and equality of the original account/password hash passed.

Initial verified release: `r20261104T180842Z-e59e3bdb`. Archive SHA-256: `e59e3bdb4446e7a8d4b8dd53a78ee6191a61ed8d141f1327302db5ce48221830`. Ignored local evidence: `.artifacts/deploy/public-check/report.json`, screenshots alongside it, and `.artifacts/deploy/offsite/report.json`. The private downloaded backup is under that offsite directory. Off-VM copying has been verified manually; automatic offsite replication is not configured.

DNS test limitation: automated Chrome on this workstation continued returning `ERR_NAME_NOT_RESOLVED` after the two public resolvers had the correct address. Native Windows Node resolved the domain and returned HTTPS 200 during checks, but later also returned a lookup failure. The browser journey used a temporary, process-local domain-to-VM mapping with TLS verification still enabled. No permanent hosts, DNS or certificate settings were changed. The user separately confirmed that the public URL opens the sign-in page in their normal browser. This does not establish propagation for every resolver. A public-IP probe confirmed that the private API port is unreachable externally.

Final local regression results: production build and lint passed, all 21 API checks passed, all 12 preview browser journeys passed, both account browser journeys passed, and the fixture-backed research browser journey passed. These fixtures remain separate from the real deployed-provider check described above.

The live agent check initially found an exhausted tool budget and an output truncation, which were corrected with a bounded submission/correction phase and a 1,024-token reasoning budget within 8,192 completion tokens. A subsequent provider timeout was reported as a failure; an explicit retry completed in about 20 seconds with two searches, one three-page extraction, price-validation feedback and three accepted options. Tests were resumed from the existing accounts/result after test-selector and refresh-timing corrections, without rerunning successful paid research. Successful integration does not guarantee provider availability or model reliability on every brief.

## Judge access and reporting release — 5 November 2026

Current release: `r20261105T064335Z-72f687b2`. Source archive SHA-256: `72f687b25232b4b09fd20d61b196694002e667c8556bc971495032c144870e4e`. The operator's changed public IP was added to API Access Control; the managed SSH rule was rotated to the new single-IP /32 after connection verification. Public web rules were preserved. Activation backed up the existing database before replacing the app container.

Schema version 5 adds an explicit judge-account marker table without revoking normal sessions. The operator ran `server/seed-judges.ts` in the running container twice to verify idempotence. The provisioner created two public accounts in a separate team, three labelled sample plans and two sample expenses; real-account ID, email, password hash, role and team fingerprints were unchanged. See [judge provisioning and the walkthrough](JUDGING.md). Judge credentials and restrictions are documented at the top of the README. The seed is not automatically run on app startup.

Local validation passed: production build, lint, all 22 API checks, 12 preview browser journeys, three account/judge browser journeys and one fixture-backed research journey. New coverage includes ordinary OTP preservation, judge isolation and administrative restrictions, seed idempotence, inclusive date filtering, CSV contents and invalid ranges. Expense screenshots were reviewed at desktop and 390px; overflow was also checked at 1024 and 768px.

The deployed check used ordinary Chrome DNS and normal certificate verification, with **no DNS mapping or TLS bypass**. It passed both public credentials, Secure/HttpOnly cookies, unauthenticated API denial, blocked judge invitations/global revocation, a fresh draft/change-request/resubmission/approval/RSVP journey, expense recording, inclusive outing/date-filtered CSV, formula escaping, invalid-range feedback and 390px layout checks. No browser page errors occurred. Provider readiness was confirmed; this pass did not repeat metered research because the agent implementation was unchanged. The earlier real-provider evidence remains separate.

The temporary verification plan and its expense were removed by exact identity checks; the public sample team remains available. A post-update online backup passed integrity checks. The post-cleanup snapshot was downloaded privately off the VM and restored into an isolated writable copy: integrity, foreign keys and both judge markers passed. Ignored evidence: `.artifacts/deploy/judge-live/report.json` and `.artifacts/deploy/offsite/judge-report.json`. README screenshots under `docs/images/` were captured from the deployed public judge team and are intentionally tracked.

## Full workflow and resilience release — 5 November 2026

Current release: `r20261105T080803Z-98d73b87`. Source archive SHA-256: `98d73b8766e883081beab29083b8024e0a32171ed1212f228cf6d85a284b5ac1`. An online snapshot preceded activation. Schema version 6 adds optional preferences, coordination/availability state, private receipts and the encrypted email outbox while preserving accounts, credentials and sessions. Existing accounts start with optional outing email off. The app remains nonroot with a read-only filesystem, database mode 600, data directory mode 700, no management API key in its environment, no local secret/test files in the image and a loopback-only API port.

The deployed normal-account check passed with four Gmail aliases controlled by the operator. It exercised actual emailed ownership proofs, an addressed team invitation, saved interests, availability messages/four replies/time selection, review/change/resubmission/approval messages, four outing invitations, 90-minute ICS export, RSVP, private receipt bytes and another teammate's access denial, expense/report idempotence, mismatched report-filter rejection, filtered CSV export/report email and 390px overflow. A real container restart preserved sessions, receipts, RSVP and eight scheduled reminders. Cancelling the plan stopped all eight and queued four cancellation calendars. Resend reported the actual test messages delivered; the app intentionally shows only provider acceptance. No claim of inbox placement or reading is made.

One browser assertion initially failed because the operator's test script had created accounts through an API while leaving an already-loaded sign-in page mounted. The script was corrected to reload after API setup and resumed the existing accounts; this was not bypassed by changing the app or creating replacement accounts. The completed test had no browser page errors or DNS/TLS overrides. Ignored evidence: `.artifacts/deploy/full-workflow/report.json`.

Small-team measurement: four real verified users, sixteen concurrent requests, 160 reads, zero failures; median 176 ms, p95 527 ms, 2.532 seconds total. This is one small read-workload check, not a stress test or a capacity guarantee. A regression test separately verifies that authenticated users behind the same IP have independent general request budgets. Authentication/code routes retain IP-based protection.

Final local checks passed: build, lint, **31 API checks**, 12 preview browser journeys, four account/workflow browser journeys and one fixture-backed research journey. The reminder test advances an isolated worker clock, verifies no early delivery, restarts the worker and verifies one send per deadline while skipping a declined guest. Production time was not changed. Earlier actual Vultr/Tavily research evidence remains valid; this pass added persistent daily quotas without rerunning paid research.

The exact temporary team, four users, plan, receipt and expense were removed after testing. Original account ID/email/password/role/team/auth-version fingerprints matched the pre-release backup; both public judge accounts remain. A post-cleanup encrypted backup and independent restore passed as described below. No demo/video preparation was performed.

The final private-file scan examined 129 Git-eligible source files and 25 frontend build files against actual local/runtime/provider/storage secrets, with no matches. Environment files, private storage configuration and restored databases are ignored. `git diff --check` passed; the staging area is empty. Public judge passwords are deliberate sample credentials, not provider secrets.

### Private automatic offsite backups

Approved storage is the dedicated **$6/month Archive tier in Amsterdam**, in addition to the $10/month VM. The private bucket is `teamfare-backups-164f787e` at `ams1.vultrobjects.com`. The host needs `python3-boto3`, installed through Ubuntu's package manager. Storage credentials and a separate random 256-bit encryption key live in root-only `/opt/teamfare/shared/backup-config.json`; they are not app environment variables or build inputs. A protected copy of this configuration and the production runtime environment is retained off the VM in ignored local deployment artifacts. Never commit either.

`teamfare-backup.timer` runs daily at 03:00 UTC plus up to five minutes of jitter. `deploy/backup.sh` holds an exclusive lock, creates a SQLite-consistent snapshot, runs the private offsite program and retains seven days locally. `deploy/offsite.py` verifies private ACLs, encrypts with AES-256-GCM using native Node crypto before upload, verifies unauthenticated object access is denied, downloads it, checks the ciphertext hash, decrypts it and checks SQLite integrity/foreign keys. The dedicated `teamfare/` prefix transitions to Vultr Archive after seven days and expires after thirty days. Archive retrieval may require provider processing; the newest seven days remain hot.

Inspect without exposing credentials:

```sh
systemctl status teamfare-backup.timer teamfare-backup.service
journalctl -u teamfare-backup.service --since today
cat /opt/teamfare/backups/offsite-status.json
```

The status file records last attempt, last success and a sanitised error category. A failed offsite replication makes the service fail while retaining the local snapshot; investigate before relying on the next backup. Local snapshots alone do not protect against VM loss. Do not rotate the backup encryption key without retaining the old key for existing objects; likewise preserve AUTH_SECRET for encrypted outbox payloads.

Actual private uploads were downloaded and restored on the VM, then two encrypted objects were retrieved and restored independently on this Windows PC using the off-VM recovery key and Node 24. The pre-cleanup snapshot's PDF receipt matched its stored byte length and SHA-256. The post-cleanup snapshot passed integrity, foreign keys, an isolated writable transaction, both judge markers and original-account fingerprints. Ignored evidence: `.artifacts/deploy/offsite/portable-restore-report.json`.

### Recovery

1. Keep the private backup configuration, stable production environment/AUTH_SECRET and a source release somewhere protected outside the VM. Losing the encryption key makes these encrypted objects unrecoverable. Credentials stay outside Git and the public repository.
2. Download a chosen encrypted object through an authenticated Vultr storage session. For an archived object, request retrieval and wait for it to be available. Restore to an isolated directory first; never overwrite a running database.
3. With Node 24 and the release source, call `archiveFile('decrypt', encryptedPath, newSqlitePath, config.encryption_key)` exported by `server/archive.ts`. Read the key from the protected JSON file inside a local script. The CLI also accepts a JSON request on stdin; never put keys in command arguments, logs or chat. The decryptor authenticates ciphertext and refuses replacing an existing destination.
4. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` against the isolated restored file. Check expected account/team counts and receipt hashes before using it.
5. On a replacement prepared host, stop the app, restore into the private persistent data volume as UID 1000 with directory 700/file 600, preserve production secrets and restart the same or a forward-compatible release. Review pending workflow mail before resuming workers; resending old snapshots outside Resend's idempotency window must not be forced. Confirm HTTPS, sign-in and permissions. Retain the previous database until recovery is verified.

### Independent uptime checks and billing

Only `.github/workflows/uptime.yml` was committed/pushed, in `e02e415`, under the user's explicit approval. It runs on standard public-repository GitHub runners with no repository secrets or paid runner configuration. It checks public HTTPS plus database-read readiness every ten minutes, with three attempts; GitHub can delay schedules. Failures appear in Actions, and notification delivery follows the owner's [GitHub notification settings](https://github.com/settings/notifications). No production outage was deliberately created and no failure email receipt is claimed.

The post-deployment independent check [passed on GitHub](https://github.com/ELLA0VICTOR/teamfare/actions/runs/41994025181); the [workflow and history](https://github.com/ELLA0VICTOR/teamfare/actions/workflows/uptime.yml) are public. Other product/documentation changes remain local and deployed; this approval did not publish the entire working tree.

At 08:24 UTC on 5 November, Vultr reported a $200 credit balance and $0.24 pending usage, approximately $199.76 effective credit. The approved VM plus storage quote is **$16/month before inference and other usage**. Eligible charges use available promotional credit subject to the promotion's terms. This is not indefinitely free hosting: promotional credit expires and paid resources continue to exist. Remove resources or arrange funding before credit ends; no card, deposit, larger tier or paid GitHub runner was added. The account API did not establish the exact promotion expiry date. See [Vultr's credit terms glossary](https://docs.vultr.com/platform/glossary).

## References

- [Vultr API access](https://docs.vultr.com/platform/other/api/enable-user-api-access)
- [Vultr provisioning](https://docs.vultr.com/products/compute/instances/cloud-compute)
- [Docker's Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Node SQLite backup API](https://nodejs.org/api/sqlite.html)
