# Teamfare

**Bring your team together. Leave the admin to us.**

Teamfare coordinates team outings, approvals, RSVPs and expenses. React + TypeScript power the interface; a Node API and persistent SQLite database now power actual accounts and shared team workflows.

**Live app: [teamfare.dixmail.xyz](https://teamfare.dixmail.xyz)**

Built for the Vultr Agent Rush **Powering the Future of Work** challenge. The web app, central API and persistent SQLite database run on a Vultr VM. The planning workflow integrates Vultr Serverless Inference and Tavily on the server; Resend delivers account verification and recovery emails.

## Run locally

Use Node **24.19 or later within Node 24 LTS**.

```sh
npm ci
npm run dev
```

This starts the API at `127.0.0.1:3001` and Vite at `http://localhost:5173`. Open the browser URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

The sample team works without external keys. Real signup, login codes and password recovery require [Resend email configuration](docs/AUTHENTICATION.md). For AI research, follow [Vultr credits and provider setup](docs/PROVIDER-SETUP.md), then fill the three provider settings in `.env`. `APP_ORIGIN` must exactly match the browser origin. The frontend uses a same-origin `/api` proxy; provider keys stay on the server.

## Try it with two real accounts

1. Choose **Create a team**, enter your details, and create and confirm a password with at least 15 characters, then enter the code sent to your email. No account access is granted before verification. The team creator becomes its first manager. New teams start empty.
2. Open the account menu and choose **Invite teammate**. Generate a one-use employee invitation code and share it with your teammate. Codes expire after three days; no email is sent automatically.
3. In a separate browser profile or private window, choose **Join a team** and use that invitation, confirm the password and verify the emailed code to create the employee account.
4. The employee describes an outing on Home. **Research options** searches and reads public pages, compares sourced venues and separates published figures from estimates; **Start a plan** retains manual planning. Choose an option, select actual teammates, edit the cost assumptions and itinerary, and send the Plan Sheet for approval. Fixed costs and per-person costs recalculate with headcount; the total estimate and budget remain separate.
5. The manager opens the plan, requests changes with a required note, or approves it. A manager cannot approve their own outing; invite a second manager if a manager will organise outings.
6. The employee can RSVP and record their own expenses. A manager can record spending for any teammate and export the filtered CSV.
7. Reload, sign out and sign in again with your password and email code: the server retains the shared records. Changes refresh on navigation, focus, and every ten seconds while the app is visible.

The database lives in `data/teamfare.sqlite`, with automatic schema setup and research-run storage and version-3/4 authentication upgrades. Keep the database and its WAL files private and backed up. See [backend architecture and operations](docs/BACKEND.md).

## Sample interface

**Explore the sample team** opens the original browser-local preview. It retains the employee/manager switch, sample plans, reset control and the existing `teamfare-preview-v1` storage key. Sample data is never automatically uploaded into a real team. Signed-in team records are not saved in localStorage.

The browseable experience catalogue and its prices remain samples in both modes. Signed-in research uses public sources when providers are configured; failures never substitute sample output. Public research does not confirm venue availability, final prices or dietary suitability. Venue booking, email invitations, payments and receipt uploads are not connected. Email verification, password recovery and password changes are implemented; real mail delivery must be configured and verified. Open **Account security** from the account menu to change your password or sign out everywhere.

## Checks

```sh
npm run build
npm run lint
npm run test:api
npx playwright install chromium
npm run test:browser
npm run test:live
npm run test:agent
```

The API tests include production serving, so run the build first. To use installed Chrome on Windows:

```powershell
$env:TEAMFARE_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:browser
npm.cmd run test:live
npm.cmd run test:agent
```

- API tests cover email verification/recovery, password changes and revocation alongside the existing account/workflow boundaries plus research permissions, idempotence, cancellation, evidence validation, cost maths, limits and provider protocols.
- Twelve preview browser journeys retain the earlier interface and local-data checks.
- Two account browser journeys cover OTP verification/reload, password change, recovery and global sign-out, plus separate manager/employee sessions for invitations, approval, RSVP, expenses, CSV and re-login.
- One agent browser journey uses separate real accounts with explicitly labelled provider fixtures for research, evidence, draft selection, cost/itinerary edits, persistence and manager approval. This does not verify live provider access.

Live browser checks use a separate ignored `.artifacts/live-test.sqlite` database. They never write to the normal `data/` database. `npm run format` formats the application, server and tests.

## Deployment and design

[Backend notes](docs/BACKEND.md) and the [deployment runbook](docs/DEPLOYMENT.md) describe the running Vultr deployment, HTTPS, protected account migration, backups and verification results. The web app and central backend run together in London on Ubuntu 24.04 with Docker and Caddy, meeting the hosting requirement of the [official challenge](https://lablab.ai/ai-hackathons/vultr-hackathon).

The interface retains Fraunces, DM Sans, the original Teamfare mark, locally saved photographs and the Plan Sheet design. See [design and asset sources](docs/DESIGN.md), [Home refinement](docs/HOME-REFINEMENT.md), [backend implementation review](docs/BACKEND-REVIEW.md), [planning agent review](docs/AGENT-REVIEW.md), and [authentication controls and delivery setup](docs/AUTHENTICATION.md).

## Committing

Commit source, public assets, documentation, configuration, checks and `package-lock.json`. Ignore rules exclude dependencies, builds, screenshots, test results, environment files, private keys, database files, runtime data and backups. The Docker context also excludes these local files.

Environment examples must contain placeholders only. Never place secrets in `VITE_` variables, which are included in browser code. Review `git diff --cached` before committing.
