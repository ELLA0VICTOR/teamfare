# Coordination and expense workflows

## Consent and durable email

Normal signup/join offers an unchecked outing-email preference. Existing accounts migrate with outing email off. Account → Outing preferences saves that choice and interests in Good food, Make something and A little adventure. The organiser can select interested teammates from their actual saved preferences. Authentication/recovery mail remains required. Public judge accounts cannot enable external email, email reports or invite real people.

Submitting a proposal notifies opted-in managers; requesting changes notifies its organiser. Approval queues invitations and calendar attachments when the outing's guest-email setting is on. Each opted-in named attendee gets reminders 24 hours and two hours before the start, only when those deadlines are still in the future. Africa/Lagos is the scheduling timezone. Cancellation stops unsent work and queues cancellation calendar files; settlement stops pending invitations/reminders. Already accepted email cannot be recalled. Declined guests do not receive reminders.

The encrypted SQLite outbox stores pending work atomically with plan changes. A worker checks every 15 seconds, claims leases and uses a stable Resend idempotency key across retries. It retries at bounded intervals up to five attempts, stopping before the provider's 24-hour idempotency window. Expired leases recover after restart; expired notifications and stale plan actions are cancelled. Preferences and membership are checked again before sending. Email payloads use AES-256-GCM with a key derived from AUTH_SECRET; preserve that secret when restoring.

Email status shows **queued, sending, accepted, failed, suppressed or cancelled**. Accepted means the provider accepted a request, not that an inbox received or read it. No webhook/inbox tracking is claimed. Fresh invitations require an explicit checkbox and are limited; they reuse existing reminder identities. Per-recipient daily limits bound outgoing coordination mail. Provider errors are sanitised.

Managers can email a one-use team invitation to an explicitly supplied address. The invitation is then bound to that verified address and cannot silently be readdressed. Its code is encrypted in the outbox and stored only as a hash in the invitation table. Codes expire after three days and are consumed once. Team invitation mail has a separate twenty-per-team daily limit.

## Availability and calendar

An organiser can propose two to six distinct future slots while the plan is a draft or changes are requested. Each slot has a date, local start time and 30–480 minute duration. Only named guests reply; an empty reply means none work. Unanswered replies stay unknown. Ranking prefers more available guests, fewer unavailable guests and then an earlier time; it does not infer calendar availability.

Replacing options increments their version and clears prior votes. Choosing a slot requires the current plan revision and poll version. Any unavailable/unanswered guests require explicit acknowledgement. Selection updates date/time/duration and shifts researched itinerary times, rejecting a day overflow. Approval closes replies. Stale actions return 409 rather than overwriting another user's work.

Approved and cancelled plans expose authenticated RFC 5545 `.ics` downloads with a stable UID, revision, UTC start/end and cancellation status where applicable. Invitations include the same calendar file. Text is escaped and UTF-8 lines folded. Importing a file is the user's action: Teamfare does not access Google/Outlook calendars, book venues or reserve rooms.

## Private receipts and reporting

Expense creation accepts an optional request UUID. Replaying the same payload returns the existing expense; changing the payload under that UUID returns 409. Recording the expense and activity is atomic. If a subsequent receipt upload fails, the expense remains recorded and the UI explains how to attach the receipt later.

PDF, PNG and JPEG receipts are limited to 5 MB and checked against their file signatures. Limits are 100 MB per team and 512 MB deployment-wide. Bytes are stored in private SQLite, included in online/encrypted backups, never exposed through static asset paths. Only the expense creator, payer or manager can upload/download/remove a receipt. Receipt removal checks its current ID. Cancelled/settled outings retain downloads but reject changes. Downloads use attachment disposition, MIME-sniffing protection and a restrictive CSP. File signature checks do not establish that a file is malware-free; no antivirus or OCR is implemented.

CSV exports and emailed reports share the same serializer and inclusive outing/date filtering. Spreadsheet formula prefixes are escaped, fields quoted and six existing columns retained. A private team's manager explicitly chooses a verified same-team recipient. Reports are capped at 2,000 rows, 1 MB and ten per team per day. A stable request UUID prevents duplicate sends; reusing it with changed filters/recipient returns 409. Explicit report requests do not depend on the recipient's optional outing-email preference.

## API additions

All mutations require the session, allowed Origin and CSRF token; all reads enforce team scope.

| Endpoint | Purpose |
| --- | --- |
| `GET/PUT /api/workflow/preferences` | Email opt-in and interests |
| `GET/POST /api/plans/:id/availability` | Read/create/replace options |
| `POST /api/plans/:id/availability/reply` | Save explicit versioned availability |
| `POST /api/plans/:id/availability/apply` | Choose a slot with revision checks |
| `GET /api/plans/:id/calendar` | Download an approved/cancelled event |
| `GET /api/workflow/emails` | Read scoped status metadata |
| `GET /api/plans/:id/emails` | Read scoped outing-email status |
| `POST /api/plans/:id/invitations` | Explicit fresh guest invitations |
| `POST /api/invites/:id/email` | Address and email a team invitation |
| `POST /api/reports/expenses/email` | Explicit filtered report request |
| `POST/GET/DELETE /api/expenses/:id/receipt` | Private binary upload/download/removal |

Schema version 6 adds preferences, availability, receipts and the workflow outbox without replacing accounts, plans, credentials or sessions. Optional plan duration and guest-email fields preserve older persisted data. Nested transactions use savepoints so plan changes and queued work commit together.
