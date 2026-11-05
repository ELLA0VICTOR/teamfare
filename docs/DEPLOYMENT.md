# Vultr deployment

Live: [https://teamfare.dixmail.xyz](https://teamfare.dixmail.xyz), deployed 4 November 2026. The web app, Node API and SQLite data run on one dedicated Vultr Ubuntu 24.04 VM in London: 1 vCPU, 2 GB RAM, `vc2-1c-2gb`, quoted by the API at $10/month before any credits or additional usage. Vultr Inference, Tavily and Resend remain external services called only by the API.

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

Release: `r20261104T180842Z-e59e3bdb`. Archive SHA-256: `e59e3bdb4446e7a8d4b8dd53a78ee6191a61ed8d141f1327302db5ce48221830`. Ignored local evidence: `.artifacts/deploy/public-check/report.json`, screenshots alongside it, and `.artifacts/deploy/offsite/report.json`. The private downloaded backup is under that offsite directory. Off-VM copying has been verified manually; automatic offsite replication is not configured.

DNS test limitation: automated Chrome on this workstation continued returning `ERR_NAME_NOT_RESOLVED` after the two public resolvers had the correct address. Native Windows Node resolved the domain and returned HTTPS 200 during checks, but later also returned a lookup failure. The browser journey used a temporary, process-local domain-to-VM mapping with TLS verification still enabled. No permanent hosts, DNS or certificate settings were changed. The user separately confirmed that the public URL opens the sign-in page in their normal browser. This does not establish propagation for every resolver. A public-IP probe confirmed that the private API port is unreachable externally.

Final local regression results: production build and lint passed, all 21 API checks passed, all 12 preview browser journeys passed, both account browser journeys passed, and the fixture-backed research browser journey passed. These fixtures remain separate from the real deployed-provider check described above.

The live agent check initially found an exhausted tool budget and an output truncation, which were corrected with a bounded submission/correction phase and a 1,024-token reasoning budget within 8,192 completion tokens. A subsequent provider timeout was reported as a failure; an explicit retry completed in about 20 seconds with two searches, one three-page extraction, price-validation feedback and three accepted options. Tests were resumed from the existing accounts/result after test-selector and refresh-timing corrections, without rerunning successful paid research. Successful integration does not guarantee provider availability or model reliability on every brief.

## References

- [Vultr API access](https://docs.vultr.com/platform/other/api/enable-user-api-access)
- [Vultr provisioning](https://docs.vultr.com/products/compute/instances/cloud-compute)
- [Docker's Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Node SQLite backup API](https://nodejs.org/api/sqlite.html)
