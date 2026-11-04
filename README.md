# Teamfare

**Bring your team together. Leave the admin to us.**

Teamfare coordinates team outings, approvals, RSVPs and expenses. React + TypeScript power the interface; a Node API and persistent SQLite database now power actual accounts and shared team workflows.

Built for the Vultr Agent Rush **Powering the Future of Work** challenge. Vultr deployment and the planning agent are the next integration steps; neither is connected yet.

## Run locally

Use Node **24.19 or later within Node 24 LTS**.

```sh
npm ci
npm run dev
```

This starts the API at `127.0.0.1:3001` and Vite at `http://localhost:5173`. Open the browser URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

No external service keys are required for this foundation. Optional server settings are documented in `.env.example`; copy it to `.env` to customise them. `APP_ORIGIN` must exactly match the browser origin. The frontend uses a same-origin `/api` proxy, so it does not need backend credentials or API keys in its bundle.

## Try it with two real accounts

1. Choose **Create a team**, enter your details, and create a password with at least 12 characters. The team creator becomes its first manager. New teams start empty.
2. Open the account menu and choose **Invite teammate**. Generate a one-use employee invitation code and share it with your teammate. Codes expire after three days; no email is sent automatically.
3. In a separate browser profile or private window, choose **Join a team** and use that code to create the employee account.
4. The employee starts an outing from Home, chooses actual teammates, edits the Plan Sheet and sends it for approval. The ledger shows per-person estimate, total estimate and budget separately.
5. The manager opens the plan, requests changes with a required note, or approves it. A manager cannot approve their own outing; invite a second manager if a manager will organise outings.
6. The employee can RSVP and record their own expenses. A manager can record spending for any teammate and export the filtered CSV.
7. Reload, sign out and sign in again: the server retains the shared records. Changes refresh on navigation, focus, and every ten seconds while the app is visible.

The database lives in `data/teamfare.sqlite`, with automatic version-1 schema setup. Keep the database and its WAL files private and backed up. See [backend architecture and operations](docs/BACKEND.md).

## Sample interface

**Explore the sample team** opens the original browser-local preview. It retains the employee/manager switch, sample plans, reset control and the existing `teamfare-preview-v1` storage key. Sample data is never automatically uploaded into a real team. Signed-in team records are not saved in localStorage.

The experience catalogue and prices are still samples in both modes. AI research, live availability, venue booking, email invitations, payments and receipt uploads are not connected yet. Email verification and password recovery delivery also await the email integration.

## Checks

```sh
npm run build
npm run lint
npm run test:api
npx playwright install chromium
npm run test:browser
npm run test:live
```

The API tests include production serving, so run the build first. To use installed Chrome on Windows:

```powershell
$env:TEAMFARE_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:browser
npm.cmd run test:live
```

- Four API tests cover shared persistence, permissions, stale writes, team isolation, sessions, CSRF, invitations, validation, cancellation, rate limits and production serving.
- Twelve preview browser journeys retain the earlier interface and local-data checks.
- One live browser journey uses separate manager and employee sessions for registration, invitation redemption, review notes, resubmission, approval, RSVP, expenses, CSV and re-login.

Live browser checks use a separate ignored `.artifacts/live-test.sqlite` database. They never write to the normal `data/` database. `npm run format` formats the application, server and tests.

## Deployment and design

[Backend and Vultr deployment notes](docs/BACKEND.md) describe the Node process, persistent storage, HTTPS and the supplied Docker/Caddy configuration. No infrastructure has been provisioned or deployed. The web app and central backend must ultimately run on Vultr for the [official challenge](https://lablab.ai/ai-hackathons/vultr-hackathon).

The interface retains Fraunces, DM Sans, the original Teamfare mark, locally saved photographs and the Plan Sheet design. See [design and asset sources](docs/DESIGN.md), [Home refinement](docs/HOME-REFINEMENT.md), and the [backend implementation review](docs/BACKEND-REVIEW.md).

## Committing

Commit source, public assets, documentation, configuration, checks and `package-lock.json`. Ignore rules exclude dependencies, builds, screenshots, test results, environment files, private keys, database files, runtime data and backups. The Docker context also excludes these local files.

Environment examples must contain placeholders only. Never place secrets in `VITE_` variables, which are included in browser code. Review `git diff --cached` before committing.
