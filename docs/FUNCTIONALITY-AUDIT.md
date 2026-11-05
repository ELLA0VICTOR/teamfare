# Functionality audit — 5 November 2026

This audit compares the implemented product with the employee-engagement concept. Current verification is recorded in [the deployment runbook](DEPLOYMENT.md); implementation details are in [workflow rules](WORKFLOWS.md).

## Alignment with the original idea

Salesforce's [official PeopleForce recap](https://www.salesforce.com/news/stories/agentforce-hackathon-nyc-recap/) describes event creation, dining recommendations, finding interested employees, scheduling and expense logging. No verified public implementation repository was supplied, so equivalent internal behaviour or complete feature parity cannot be established. Teamfare is independently implemented around that problem.

| Capability | Implemented and exercised | Practical boundary |
| --- | --- | --- |
| Find outings and dining options | Real Vultr tool calling with Tavily search/extraction, citations, price assumptions, questions and multiple choices | Confirm venue availability, dietary suitability and final terms directly; no Maps/travel-time integration |
| Plan an event | Editable itinerary, date/time/duration/place, named guests and deterministic fixed/per-person cost calculations | Approval is not a booking |
| Review spend | Separate manager approval or required change note; stale revisions and self-approval rejected | One-stage approval; no delegated or configurable enterprise policy engine |
| Find interested people | Saved activity preferences, displayed interests and organiser selection of matching teammates | Suggestions use actual categories, not inferred sensitive profiles |
| Agree on a time | Versioned options, named availability replies, honest ranking, unknown/conflict acknowledgement and organiser selection | Availability is collected inside Teamfare, not read from external calendars |
| Coordinate people | Addressed one-use invitation email, opt-in review/outing email, scheduled reminders, RSVP and cancellation updates | Provider acceptance is visible; the app does not track inbox delivery/read receipts |
| Calendar | Authenticated ICS exports plus invitation/cancellation attachments using saved duration | File import, not Google/Outlook OAuth synchronisation |
| Expenses and evidence | Durable records, private bounded PDF/PNG/JPEG receipts, permission checks and activity | No OCR, antivirus claim, reimbursement or payment integration |
| Reporting | Inclusive outing/date filters, formula-safe CSV and explicit manager-requested report emails to verified teammates | CSV report, not an accounting/payroll integration |
| Agent automation | Bounded real research creates an editable sourced draft after human selection | The model cannot approve, pay, book, email arbitrary recipients or execute code |
| Accounts and judge access | Verified signup, password plus email code, recovery, changes, revocation and team isolation; two restricted public judge accounts in their own team | Judge credentials are intentionally public and exempt from OTP; normal accounts are not |
| Operations | Vultr HTTPS deployment, online snapshots, automatic encrypted private offsite replication with download/restore checks, independent uptime workflow | One VM; recovery requires an operator; no automatic failover |

## Gaps closed in this pass

The earlier audit's four recommended additions—coordination email, scheduling, receipt evidence/report email, and operational resilience—are implemented. Schema version 6 preserves existing accounts and adds the durable state needed for these workflows. Fresh receipt and report requests are idempotent; plan/poll writes reject stale revisions. Notifications recheck consent and plan state before sending, recover after restart and stop unsent reminders on cancellation/settlement.

The original scope is now represented by a complete research → planning → availability → separate-manager review → opt-in invitations/calendar → RSVP → private expense evidence → reporting journey. This establishes functional alignment, not a claim that every feature in the inaccessible reference implementation was reproduced.

## Verification and limits

Build/lint, 31 API checks, 12 preview journeys, four account/workflow browser journeys and one fixture-backed research browser journey pass. API coverage exercises OTP/recovery, scope, replay, idempotence, stale writes, consent, retries/lease recovery, receipts, CSV/calendar serialization and backup restoration. Real Vultr/Tavily research was verified in the earlier deployment pass; this pass preserved the runner and added persistent daily usage limits without spending more research credits.

The deployed workflow used four ordinary accounts verified through real email codes, without DNS or TLS bypass. Actual availability, review, change, invitation, cancellation and report emails were accepted; Resend subsequently reported them delivered. That is a provider-reported delivery event, not an independent inbox placement/read check. Scheduling, approval, RSVP, private receipt access, report replay/mismatch checks, calendar duration and real container-restart persistence passed. Eight scheduled reminders survived restart, then cancellation stopped all eight. Reminder execution at a simulated deadline and retry/failure branches are covered by isolated API tests; production clocks were not altered to force a future reminder.

The measured small-team check completed 160 reads across four verified users with 16 requests in flight, no failed responses, 176 ms median and 527 ms p95 in 2.532 seconds. These are one-run measurements from this connection, not capacity guarantees or evidence for a large organisation.

Each offsite upload is private, encrypted before leaving the VM and downloaded/decrypted for SQLite integrity and foreign-key checks. Independent HTTPS monitoring passed in GitHub Actions. No production outage was deliberately created, and notification destination depends on the owner's GitHub settings. See the runbook for backup recovery, costs and provider-credit limits. Tests establish exercised behaviour, not an absence of all bugs.
