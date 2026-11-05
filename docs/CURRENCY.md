# Display currency

The app defaults to USD. The header selector also offers NGN and saves the choice in this browser under `teamfare-display-currency-v1`. It does not infer currency from location, role or email.

Existing amounts remain whole-NGN source values. Switching currency is read-only. Dollar inputs convert to source units once when edited; focusing and leaving an unchanged field does not rewrite it. Dollar amounts accept cents. Budget limits, approvals and price-evidence checks continue to use the source ledger. This is display conversion, not currency exchange or payments.

`GET /api/currency` supplies a dated reference snapshot. The server uses a fixed HTTPS provider URL, five-second timeout, daily refresh, request coalescing and one-hour failure backoff. Validated snapshots persist in SQLite. Provider failure retains a dated cached reference. Pages show the rate, date and required [ExchangeRate-API attribution](https://www.exchangerate-api.com/docs/free). The preview uses a dated bundled snapshot.

Generated narrative prices follow the selected currency. Verbatim evidence quotes stay in their original wording. Converted amounts round to cents. Proposal ledgers show a rounding row where needed; displayed budget differences use displayed totals. Report totals sum individually rounded expense rows.

NGN CSV exports retain six original columns. USD exports include the original amount, rate, update date and source alongside the USD amount. Formula escaping remains. Emailed reports use the selected currency and server-known snapshot ID, rather than a client-supplied rate. Snapshots are included in normal SQLite backups.

Verification: build and lint; 36 API/unit checks; 15 preview browser checks; four existing real-account browser workflows; a new mixed-currency organiser/manager workflow; one agent browser workflow. Live checks covered both judge accounts, read-only switching, USD CSV and layouts at 1440, 1280, 1024, 768 and 390 pixels. Automated Chrome used a test-only mapping to the independently validated public A record; ordinary DNS and HTTPS passed separately.

Deployed release: `r20261105T140136Z-e238916d`. Existing amounts were not migrated or relabelled as native dollars. No new paid service or API key was needed.
