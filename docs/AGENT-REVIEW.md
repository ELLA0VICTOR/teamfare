# Planning agent implementation review

## Behaviour

Signed-in members can research an outing through Vultr tool calling and Tavily Search/Extract. Public-page evidence, timestamps, quoted published figures, estimated assumptions and outstanding confirmation questions travel with the selected draft. A deterministic ledger multiplies per-person lines by headcount and adds fixed costs. Rounded averages are labelled approximate; they are not used to reconstruct totals.

Organisers can edit costs and itinerary before requesting approval. A changed cost becomes an estimate, rather than retaining a misleading published-price quote. Managers can inspect the original accepted research. Existing review notes, RSVP, expenses, CSV export and the separate local sample interface remain available.

Research runs persist in SQLite schema version 2. An interrupted run is marked failed at restart and is not automatically retried. Selection is transactional and creates at most one draft per run. Original results retain their evidence when the organiser edits the resulting plan.

## Boundaries

Only server-defined search, source-reading and option-submission tools exist. The model cannot execute code, access accounts, approve plans, send messages, book, or pay. Page text is treated as untrusted input. Reading accepts IDs returned by search; the server only contacts fixed Vultr/Tavily API origins. Evidence is not a venue guarantee, and a matching price excerpt is not independent proof that a price is current.

The model receives the outing brief and planning fields plus the organiser's own dietary preference. It is not sent the team's account emails, passwords, session tokens or expense history. Briefs and extracted public excerpts are stored in the team's private database; organisers should avoid putting unnecessary personal information into the brief.

The existing account, CSRF, team isolation and revision checks apply. Research is private to its owner until an option is saved as a team plan; team members can then read that accepted run. Cancellation and selection stay owner-only. Bounded calls, timeouts, response-size limits, persisted hourly quotas and concurrency limits reduce runaway work. Provider failures never return fabricated success.

## Verification performed

- Production build and TypeScript checks.
- Lint.
- API coverage now includes authentication, SQLite backup/restore, research boundaries and provider protocols, plus regression checks for late proposal corrections and truncated model responses. See the deployment runbook for current live checks.
- Twelve existing preview browser journeys.
- One existing real-account browser journey covering approval changes, RSVP, expenses, CSV and re-login.
- One new two-account research journey using labelled deterministic provider fixtures: research, evidence, comparison, selection, edited cost/headcount, itinerary, reload, shared original research and manager approval.
- Screenshots reviewed for desktop options, mobile options, mobile draft and manager review. The new journey checks 390px overflow and browser errors.
- Public, unauthenticated Vultr model-list helper run successfully.
- A separate real-provider browser check on 4 November 2026 passed against Vultr Serverless Inference and Tavily: four searches, two extraction calls reading five pages, three distinct sourced options, selecting the recommendation, saving/reloading the draft, shared original research and approval by another manager. Desktop and 390px screenshots were captured; no horizontal overflow or browser errors were observed. Total check time was about 53 seconds. Temporary accounts and a separate SQLite database kept the user's team data untouched. Local evidence is in `.artifacts/live-providers/report.json` and screenshots in that directory; these contain no provider credentials and remain ignored.

Research screenshots and isolated browser-test databases are ignored under `.artifacts/`. Provider fixtures are test-only, explicitly labelled, and cannot be injected into a production app. They are excluded from the Docker build context.

## Not verified

Real runs establish provider access and workflow integration; they do not establish the model's success rate across other briefs or confirm promo-credit accounting. See [provider setup](PROVIDER-SETUP.md). The successful runs included estimated prices and explicitly over-budget alternatives, while recommending an option within budget. All real availability, final prices, dietary suitability and booking terms still need direct venue confirmation. Venue bookings, outing invitations and payments are not integrated. Authentication email delivery is integrated and tested; see [authentication review](AUTHENTICATION.md).

## Deployed verification

The app and central backend now run on Vultr with Docker/Caddy. The deployed journey on 4 November 2026 found and corrected a turn-budget failure and model output truncation. The adapter requires tool calls and gives the model 8,192 completion tokens with at most 1,024 reasoning tokens at low effort. The runner allows twelve model turns, reserving the last three for submission/correction while retaining the existing search/read/time/usage limits. Invalid submission feedback is visible as a real validation event; source and price checks remain enforced. Truncated responses are rejected before tool execution. These controls follow [Vultr's completion API](https://api.vultrinference.com/docs/reference/create-chat-completion) and [reasoning controls](https://api.vultrinference.com/docs/concepts/reasoning); another model must support the configured controls.

A later Vultr timeout remained an explicit failure. An intentional retry on the deployed VM completed in about 20 seconds: two searches, three pages read, one unsupported published-price claim corrected, and three distinct options with a within-budget recommendation. Selection, change requests, resubmission, manager approval, RSVP, expenses, CSV, restart persistence and fresh email-code login passed. Temporary verification teams were removed. See [deployment evidence and the browser DNS limitation](DEPLOYMENT.md).
