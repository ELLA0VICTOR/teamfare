# Teamfare

**Bring your team together. Leave the admin to us.**

A React + TypeScript product preview for team outings and expenses, built for the Vultr Agent Rush "Powering the Future of Work" challenge.

## Run locally

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Try the journey

1. Describe an outing on Home. Add people, location, a rough date, and a per-person budget, then select **Start a plan**. On mobile, open **Add details** to change those fields. Ctrl/Cmd+Enter also starts a draft.
2. Refine the Plan Sheet. The ledger recalculates with the experience and headcount. Save a draft, or send it to Nadia for approval. Over-budget proposals cannot be sent or approved.
3. Use the account menu to try the manager view. Nadia can approve or request changes with a required note. The note stays with the plan; the employee view can edit and resubmit it.
4. Switch back to the employee view to RSVP **Going** or **Can't make it**. Plans show the next action, estimated total, and per-person cost.
5. Add an expense to an approved outing using the side drawer. Expenses are grouped by outing; CSV export follows the selected outing filter.
6. For a past approved outing, a manager can explicitly mark expense recording settled. Cancellation and settlement preserve existing records. Reset the preview from the footer when needed.

The preview uses fictional teammates, sample experiences, and estimated NGN prices. Data is stored in this browser. It has no live AI service, authentication, venue availability, bookings, email delivery, payments, or cloud backend. The account role switch is a local preview control. Activity history contains only actions taken in the app; older sample records do not get invented historical events.

Saved data still uses `teamfare-preview-v1`. New plan properties are optional, so earlier plans, RSVPs, expenses, saved ideas, and preferences are retained. The employee view is Akin (also the organiser); the manager view is Nadia. Role selection resets to employee after a reload.

## Check

```sh
npm run build
npx playwright install chromium
npm run test:browser
```

Twelve browser checks cover Next up priority and fallback, formatted budgets, financial consistency, plan creation, composer prefilling, live cost calculations, budget correction, required manager notes, approvals, RSVP persistence, CSV contents and escaping, cancellation, explicit settlement, old saved data, mobile navigation, and keyboard containment and dismissal. There is no separate unit-test suite. Run `npm run lint` for the configured lint checks. To use an installed Chrome browser on Windows:

```powershell
$env:TEAMFARE_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:browser
```

`npm run format` formats the source and browser checks.

## Committing

Commit the source, public assets, documentation, configuration, browser checks, and `package-lock.json`. The ignore rules exclude dependencies, builds, local screenshots, test reports, environment files, private keys, and local deployment state.

Use `.env.example` or `.env.<environment>.example` only for placeholder values. Keep real credentials in local environment files or server configuration. Values prefixed with `VITE_` are included in the browser bundle, so they must never contain secrets. Review `git diff --cached` before committing.

## Design and infrastructure

See [design direction and asset sources](docs/DESIGN.md). The Plan Sheet interface uses locally bundled Fraunces and DM Sans, Lucide interface icons, the original Teamfare mark, and local Unsplash photography. See [Plan Sheet implementation notes](docs/FRONTEND-REVIEW.md) and the latest [Home refinement and verification](docs/HOME-REFINEMENT.md).

The final hackathon web app and central orchestration backend must be deployed on Vultr. No infrastructure has been provisioned by this frontend implementation. [Official challenge](https://lablab.ai/ai-hackathons/vultr-hackathon).
