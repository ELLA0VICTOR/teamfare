# Workflow completion checklist

Active implementation scope, 5 November 2026. Demo and submission work is on hold until the known product gaps below are implemented, deployed and verified. An unchecked item is not a delivered feature.

- [x] Durable outing invitations, review updates, cancellations and scheduled reminders, with opt-in preferences, retries, idempotence and visible status.
- [x] Email delivery for one-use team invitations with an explicitly chosen recipient.
- [x] Availability proposals, teammate replies, honest matching/ranking and organiser selection with conflict acknowledgement.
- [x] Calendar export and calendar attachments using the saved date, time and duration.
- [x] Private PDF/JPEG/PNG receipt uploads, access controls, limits, download and removal, included in database backups.
- [x] Manager-authorised expense report emails with the same outing/date filters and CSV as the on-screen report.
- [x] Activity-interest preferences and suggested teammates based on actual saved preferences.
- [x] Automatic protected off-VM backups, health alerting and a measured multi-user check.
- [x] Migrations, normal accounts and existing data preserved; abuse, cross-team access, replay, retry, stale writes and cancellation tested.
- [x] Complete real-account workflow verified on the deployed app, with provider acceptance distinguished from inbox delivery.

Venue bookings, card charges and reimbursements remain external commitments requiring a separate provider/account and explicit user action. These are not implied by an approved outing or an expense record. Calendar availability collected inside Teamfare must not be described as external Google/Outlook calendar synchronisation.

Completion evidence: [deployment and operational results](DEPLOYMENT.md), [rules and API](WORKFLOWS.md), and [scope/verification limits](FUNCTIONALITY-AUDIT.md). The deployed real-account test passed; automated reminder deadline/restart tests passed without changing production clocks. Encrypted backups were also downloaded from Vultr and restored on this PC using the separately retained recovery key, including byte-level receipt verification. This completes the enumerated scope, not a guarantee of zero bugs or enterprise scale. No demo/video/submission work was started.
