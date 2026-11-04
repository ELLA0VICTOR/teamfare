# Teamfare

**Good people. Great plans.**

A React + TypeScript product preview for team outings and expenses, built for the Vultr Agent Rush "Powering the Future of Work" challenge.

## Run locally

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Try the journey

1. Browse and save sample experiences, or describe an outing on the home page.
2. Choose an experience, set the people, date, and total budget, then save a draft or send it for approval.
3. Use the profile menu at the top right to try the manager view. Open Our plans > Needs attention to approve or request changes. Plans whose estimated cost exceeds their budget cannot be approved.
4. Switch back to the employee view to RSVP. Drafts and returned plans can be edited and resubmitted.
5. Record an expense for an approved outing. Filter and export a CSV from Expenses. Cancellation retains recorded expenses.

The preview uses fictional teammates, sample experiences, and estimated NGN prices. Data is stored in this browser. It has no live AI service, authentication, venue availability, bookings, email delivery, payment rails, or cloud backend. Reset the preview through the footer's "Made for good company" button.

## Check

```sh
npm run build
npx playwright install chromium
npm run test:browser
```

Browser checks cover plan creation, employee/manager transitions, budget correction, approvals, RSVP persistence, CSV contents, cancellation, mobile navigation, and keyboard dismissal. To use an installed Chrome browser on Windows:

```powershell
$env:TEAMFARE_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:browser
```

`npm run format` formats the source and browser checks.

## Committing

Commit the source, public assets, documentation, configuration, browser checks, and `package-lock.json`. The ignore rules exclude dependencies, builds, local screenshots, test reports, environment files, private keys, and local deployment state.

Use `.env.example` or `.env.<environment>.example` only for placeholder values. Keep real credentials in local environment files or server configuration. Values prefixed with `VITE_` are included in the browser bundle, so they must never contain secrets. Review `git diff --cached` before committing.

## Design and infrastructure

See [design direction and asset sources](docs/DESIGN.md). The interface uses locally bundled Fraunces and DM Sans, Lucide icons, original SVG illustrations, and local Unsplash photography.

The final hackathon web app and central orchestration backend must be deployed on Vultr. No infrastructure has been provisioned by this frontend implementation. [Official challenge](https://lablab.ai/ai-hackathons/vultr-hackathon).
