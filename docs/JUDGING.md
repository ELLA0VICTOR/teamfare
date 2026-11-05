# Judge walkthrough

Open [Teamfare](https://teamfare.dixmail.xyz). The [README](../README.md#judge-access--no-signup-needed) lists two intentionally public credentials: organiser and manager, both in the separate shared Judge team. Use separate browser profiles or a normal/private window. Only these explicitly seeded accounts skip email OTP; real accounts retain verification.

## Two-minute product tour

1. Sign in as the organiser. Home has the brief composer, current work and sample ideas. Open **Sample team lunch**, inspect its ledger and RSVP.
2. Sign in as the manager in a separate profile. Review **Sample pottery afternoon**, inspect the estimate against budget, and **Request changes** with a note.
3. In the organiser profile, open the same plan, change a detail, and resubmit. The manager can now approve. Judge changes are shared, so another visitor may already have reviewed the seeded plan; create a fresh manual plan if needed.
4. Record an expense against an approved outing. In **Expenses**, filter by outing/date, inspect the matching record count and total, and **Export CSV**. These are records, not real charges.

## Live agent demonstration

As the organiser, describe a future lunch or activity with a specific location, headcount and budget. Select **Research options**. Watch real search/read/validation events, compare choices and inspect cited pages, price assumptions and confirmation questions. Choose **Use this plan**, refine it, and request the manager's approval.

This makes metered Vultr/Tavily calls. Limits are shared with other visitors to the same public account: four starts per hour, one active per account, two globally and three minutes per run. A timeout or quota is shown as a failure; sample output is never substituted. The separate local **Explore the sample team** preview requires no calls.

No venue is booked, no invitation is sent and no payment is made. The seeded samples are explicitly authored and do not contain fabricated live research. Use sample information: public judge records are visible and editable by other judges, while private real teams remain separate.

## Operator provisioning

Run `npm run seed:judges` against the intended database. It adds a dedicated team, two public identities and labelled manual sample records. It refuses conflicting identities and preserves existing passwords, plan changes and activity on repeated runs.

For the current deployment:

```sh
cd /opt/teamfare/current
docker compose --project-name teamfare \
  --env-file /opt/teamfare/shared/production.env \
  -f compose.yaml -f deploy/compose.production.yaml \
  exec -T teamfare npm run seed:judges
```

Do not seed through account-registration APIs or change normal-user verification settings. Judge status is set only by the operator seed and checked against the canonical account/team IDs. Shared credential changes, invitations and sign-out-everywhere are rejected on the server. Per-session sign-out still works. The seed is explicit, not automatically run on every production startup.
