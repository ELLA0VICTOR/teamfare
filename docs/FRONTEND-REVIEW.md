# Plan Sheet implementation and review

This records the initial Plan Sheet redesign. The subsequent [Home refinement](HOME-REFINEMENT.md) replaces the agenda with Next up, adds pottery and tennis photographs, clarifies financial labels, and extends verification to 12 browser checks.

Implemented locally on 4 November 2026. The React, TypeScript and Vite stack is unchanged; no dependencies were added and nothing was deployed, committed or pushed.

## Product changes

- Home now leads with a large outing composer. People, location, date, and per-person budget prefill a persisted, editable draft. Ctrl/Cmd+Enter submits. A short agenda surfaces role-specific next actions.
- Plans use ruled rows with a compact five-stage route, explicit estimated total and per-person costs, and a visible next action. Needs you is the initial filter when something needs the viewer.
- Each outing has a full Plan Sheet, reachable through a hash URL that survives reload. It combines editing, an experience itinerary, live cost ledger, people and RSVPs, recorded expenses, and an activity history.
- Managers see review facts and a clear verdict. Requesting changes requires a nonblank note; organisers can edit and resubmit. Earlier notes remain available as reference. Approval never claims to send invitations.
- RSVP choices distinguish Going, Can’t make it, and Not replied. Counts and confirmation messages are announced politely.
- Expenses are grouped by outing with a spending sentence and thin bars. Recording uses a right drawer, or a full-screen sheet on phones. Filtered CSV columns, order, quoting, and formula-prefix escaping are preserved.
- Mobile uses bottom navigation and a persistent Plan Sheet action. Desktop uses a sticky summary rail. The manager’s primary approval action moves into the mobile rail.
- The scrapbook hero, stickers, sticky note, repetitive orange italic headings, text-filled illustrations, and expense KPI strip have been removed. The top sample-data banner remains removed.

## Retained behaviour and data

The cream/forest identity, serif voice, original mark, locally bundled fonts, local photographs, saved ideas, preferences, plan editing, approvals, RSVPs, expenses, cancellation, reset control, and CSV export remain.

Persistence still uses `teamfare-preview-v1` and version 1. Optional plan fields add location, review notes, declined RSVPs, activity events, and explicit settlement. Loading earlier data supplies empty arrays for missing events and declined RSVPs, preserving other records. Old drafts without a location use their experience’s location when edited.

Akin is the employee and organiser; Nadia is the manager. The account control changes the local view, not authentication. Role selection returns to employee on reload. Manager actions appear only in the manager review view; this is not server-enforced authorisation.

## Deliberate adaptations

- Status values retain the existing Draft, Awaiting approval, Approved, Changes requested and Cancelled semantics. The route maps these onto Idea/Proposed/Approved and uses the date for Happening. Returned proposals stay Changes requested, with their route at Idea.
- Settlement is an explicit manager action for a past approved outing, stored in optional `settledAt`. A date passing does not falsely imply that expense recording is complete. Settled outings retain their records and stop accepting new expenses.
- The existing model contains one selected experience. The itinerary and cost ledger represent that real item; they do not invent multiple researched activities or price breakdowns.
- Ember was adjusted from `#B84A1C` to `#AD4318`: the proposed shade fell below 4.5:1 on the review background. Older review notes become neutral when no longer awaiting the organiser.
- The desktop header is 72px; the phone header is 64px. The expense drawer is 440px to give native date and amount controls sufficient room. Both retain 44px control targets and adapt to narrow widths.
- Photography is reused only from existing files. Clay and court have consistent, single-colour category placeholders until suitable photography is supplied. No external image requests or new image assets were introduced.
- The timeline records actions actually taken in this browser. No historical events are invented for sample or older records. No synthetic agent steps appear.

## Verification performed

| Check | Result |
| --- | --- |
| `npm.cmd run build` | Passed: TypeScript and production Vite build |
| `npm.cmd run lint` | Passed without lint warnings |
| `TEAMFARE_BROWSER_CHANNEL=chrome npm.cmd run test:browser` | 10 passed |
| Desktop and mobile complete workflows | Passed at 1440px and 390px |
| Layout and content probes | 34 checks passed; no detected page overflow, broken images, text below 13px, or browser errors |
| Additional layout widths | Home, Plans, approved Plan Sheet and Expenses at 1280, 1024, 768 and 360px |
| Manager review at 1280×720 | Approve and Request changes both above the fold |
| Zoom/reflow check | Home, Plans, approved Plan Sheet and Expenses at 200% CSS zoom |
| Token contrast calculations | 19 foreground/background combinations passed 4.5:1; minimum 4.73:1 |
| Keyboard checks | Dialog Escape, focus return, and repeated Tab containment passed |
| Saved-data compatibility | Old seeded records and fresh browser storage passed |

The ten browser checks retain the original five journey concerns and extend them for the new presentation: approval/RSVP persistence, budget correction and review notes, safe filtered CSV, mobile navigation and keyboard interactions, cancellation retaining expenses, composer prefilling/live ledger, old data compatibility, explicit settlement, and full desktop and mobile journeys.

Screenshots were captured at 1440 and 390px for Home, Plans, draft Plan Sheet, manager proposal, approved Plan Sheet, Expenses, and the expense drawer. Viewport and full-page versions are under `.artifacts/plan-sheet/`, along with a 1280px manager review and JSON layout/contrast results. They were inspected and refined for action placement, money typography, focus handling, status treatment, contrast, and responsive layout. `.artifacts/` remains ignored by Git.

There is no separate unit-test suite. These checks used installed Chrome through Playwright; Safari, Firefox, actual phone hardware, native browser zoom, and screen-reader output were not tested. Numeric token contrast checks and keyboard checks are not a full accessibility certification.

## Files changed

| Files | Purpose |
| --- | --- |
| `src/App.tsx` | Shell, role controls, hash views, plans, expense grouping, persistence, CSV and confirmation flows |
| `src/App.css`, `src/index.css` | Design tokens, typography, layouts, responsive views, motion and interaction states |
| `src/components/Home.tsx` | Composer, next steps, ideas and saved filtering |
| `src/components/PlanSheet.tsx` | Editable outing document, review, ledger, RSVP, expenses and activity |
| `src/components/RouteLine.tsx`, `src/plan.ts` | Shared route stages, next actions and plan helpers |
| `src/components/ExpenseLedger.tsx` | Shared expense rows and spending bars |
| `src/components/Forms.tsx`, `src/components/Modal.tsx` | Expense drawer, validation, keyboard cycling and focus restoration |
| `src/components/ExperienceArt.tsx` | Consistent local photos and simple category placeholders |
| `src/data.ts` | Backward-compatible optional fields and load normalisation |
| `tests/journeys.spec.ts` | Updated existing journeys and added regression coverage |
| `index.html` | Updated page title and theme colour |
| `README.md`, `docs/DESIGN.md`, `docs/FRONTEND-REVIEW.md` | Product journey, design, limitations and verification |

## Remaining work

The AI agent, real venue research and availability, authentication, shared durable storage, server-enforced approvals, bookings, invitations, payments, and Vultr deployment remain unconnected. The current application is a browser-local product preview. Prices are estimates and venues are not verified.

The pottery experience **A little clay play** and sports experience **Meet you on the court** need real photographs. Existing photos illustrate sample activities; they are not evidence of the named Lagos locations.
