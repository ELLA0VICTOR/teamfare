# Authentication and account recovery

Teamfare now checks both a password and ownership of the email inbox before issuing a session. The original foundation did not verify inbox ownership and had no recovery or password-change flow. Those gaps were real; the following describes the replacement rather than claiming the old flow was complete.

## Account journeys

| Journey             | What the server requires                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a team       | Name, email, matching password/confirmation, then the emailed code. The user and team are created only after verification.                                                               |
| Join a team         | A valid manager-issued invitation and the same email/password verification. Invitation consumption and membership creation are atomic; a code expiring during verification is rejected.  |
| Sign in             | Correct existing password, then the emailed code. No session is created after the password step alone.                                                                                   |
| Forgot password     | A generic response for known and unknown addresses. A valid account receives a reset code; the UI requires that code and matching new passwords.                                         |
| Reset password      | Single-use email proof; replaces the password and revokes all sessions and pending account challenges. Does not automatically sign in.                                                   |
| Change password     | Signed-in session, CSRF, correct current password, matching new passwords and email code. The new password takes effect only after the code is confirmed. All sessions are then revoked. |
| Sign out everywhere | Authenticated CSRF-protected action revokes every session and pending challenge.                                                                                                         |

Account security is available in the signed-in account menu. Email address changes, account deletion, administrator recovery and organisation SSO are not implemented.

## Controls

- Passwords are 15–128 characters, permit spaces and password managers, and use independently salted scrypt (`N=32768`, `r=8`, `p=1`, 64-byte result). No plaintext password is persisted or logged. Existing shorter passwords can still sign in and be replaced; new ones follow the stronger policy.
- Cryptographically random six-digit codes expire after ten minutes, are single-use, and lock after five incorrect attempts. Codes are stored as HMAC-SHA256 digests using server-only `AUTH_SECRET`; the challenge ID is random, not a user identifier. Codes are never returned by the real API or printed to logs.
- Resend waits one minute, permits at most three deliveries per challenge, replaces the old code, and does not reset the failed-attempt count or extend the original expiry. Per-email delivery limits persist in SQLite: five requests per hour across purposes. Login attempts also have a persistent per-email limit of twenty per fifteen minutes. IP limits apply separately.
- A second signup cannot overwrite an existing account's password or membership. Pending signup stores only a password hash. Reset/password-change proofs carry the account's authentication version, preventing stale proofs from restoring an older password.
- Sessions use random 32-byte tokens; only their SHA-256 digest is stored. Cookies are host-only, HttpOnly, SameSite=Lax and Secure in production. Sessions have a seven-day absolute lifetime and thirty-minute inactivity limit based on authenticated requests. Password resets/changes and global sign-out revoke existing sessions and pending proofs.
- Every mutation checks the exact configured Origin; authenticated mutations also require CSRF. Fresh sign-in rotates the presented session. Signed-in state and credentials are never placed in localStorage. An unfinished email challenge can survive reload in the same tab via sessionStorage; passwords and codes are not saved there.
- Password-change security notifications are queued in the same SQLite transaction as the change. The server retries undelivered notifications up to three times, at least a minute apart, including after restart. A provider's accepted response is not proof that a message reached the inbox. Operators must check failed notifications and provider delivery logs.
- Minimal account audit events are stored without passwords, codes or raw email addresses. The application has no production test-inbox endpoint. Test mailboxes exist only in isolated test files excluded from the Docker context, and dependency injection of test mailers is rejected in production.

Email codes add inbox-ownership checks, but are not phishing-resistant MFA. Compromise of the inbox remains a recovery risk. Passkeys/TOTP, breached-password screening, a formal penetration test, larger-scale abuse protection and managed identity/SSO remain possible hardening work. No implementation or passing test suite can establish zero vulnerabilities.

## Configure delivery

1. Create an API key in [Resend](https://resend.com/api-keys). Copy the actual secret, which starts with `re_`, into `.env` as `RESEND_API_KEY`. A key name or identifier is not the secret.
2. Add a domain you own in [Resend Domains](https://resend.com/domains), configure its required DNS records in the registrar, and wait for verification. Copying DNS records alone is not confirmation that verification has completed.
3. Set `EMAIL_FROM` to an address under the verified domain. This project's selected sender is `Teamfare <noreply@dixmail.xyz>`. You do not need a receiving mailbox at that address to send verification codes, but users cannot reply to it unless receiving mail is separately configured.
4. Set `AUTH_SECRET` to a random secret of at least 32 characters. A random value was generated locally without displaying it. Keep it stable across restarts; rotating it invalidates pending code proofs. Compose requires it at startup.
5. Restart `npm run dev`. Production also requires HTTPS. Missing mail settings stop account activation rather than bypassing verification. The sample team remains available.

```dotenv
RESEND_API_KEY=your_resend_secret
EMAIL_FROM="Teamfare <noreply@dixmail.xyz>"
AUTH_SECRET=your_random_server_secret
```

For a temporary owner-only test, `Teamfare <onboarding@resend.dev>` can send only to the email associated with the Resend account. It cannot support general teammate signup; see [Resend's restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Migration and verification

SQLite schema versions 3 and 4 add verified-email state, authentication versioning, code challenges, persistent limits, audit events, notification outbox and session inactivity tracking. Existing teams/plans/expenses and password hashes remain. Previous sessions are revoked during upgrade, and existing users must verify their email on the next login or recover through email. Database files remain private and ignored; back up using the existing SQLite-consistent procedure before deployment.

Tests cover pending account access, password confirmation, ownership proof, replay, guessing, expiry, resend invalidation, duplicate signup, recovery, password changes, CSRF, stale login proofs, session revocation, email failures and migration. Browser checks cover OTP login and reload, password change, recovery and global sign-out in addition to the existing manager/employee journey. Automated delivery uses clearly isolated mail fixtures; real delivery requires a valid key, verified domain and an actual inbox check.

On 4 November 2026, the corrected local Resend key successfully listed `dixmail.xyz` as **verified**. A separate live-transport check sent signup and reset messages from `Teamfare <noreply@dixmail.xyz>` to the account owner's Gmail address. Resend accepted them, and the user confirmed receipt in the inbox. The check used an isolated database and random temporary passwords; code handling stayed in memory and no code or API secret was displayed. It verified account activation, single-use code rejection, password reset, rejection of the old password and revocation of the previous session. It did not create or change the user's actual team account. The sanitized local report is `.artifacts/auth-live/report.json` (ignored).

The production build, lint, 18 API checks, 12 preview browser journeys, two account browser journeys and the research browser journey were run during this work. The account journey found a field-label issue, which was fixed; the test inbox helper also needed to wait for the asynchronous reset message rather than read a previous code. Real mail delivery was checked separately as described above. These checks establish the exercised behaviour, not an absence of all bugs or vulnerabilities.

Deployment verification subsequently passed 21 API checks and actual signup/invitation proofs and fresh sign-in codes through Resend on the public HTTPS app. Cookies were Secure and HttpOnly; sessions and shared team data survived a deployed-container restart. The original local account/password was retained, while copied old sessions were cleared. Temporary verification accounts were deleted after checking the workflow. See [deployment results and DNS limitations](DEPLOYMENT.md).

## References

- [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP email ownership verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html)
- [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Resend sending API](https://resend.com/docs/api-reference/emails/send-email)
