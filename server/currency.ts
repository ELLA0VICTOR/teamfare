import type { Store } from "./store.ts";
import { referenceQuote } from "../src/currency.ts";
import type { CurrencyQuote } from "../src/currency.ts";

export class CurrencyService {
  private pending: Promise<CurrencyQuote> | undefined;
  private lastAttempt = 0;
  constructor(
    privateStore: Store,
    options: { now?: () => number; fetcher?: typeof fetch } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
    this.store = privateStore;
    privateStore.db.exec(
      "CREATE TABLE IF NOT EXISTS currency_quotes (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL)",
    );
    this.save(referenceQuote);
  }
  private store: Store;
  private now: () => number;
  private fetcher: typeof fetch;
  private save(quote: CurrencyQuote) {
    this.store.db
      .prepare(
        "INSERT OR IGNORE INTO currency_quotes(id,updated_at,data) VALUES(?,?,?)",
      )
      .run(quote.id, quote.updatedAt, JSON.stringify(quote));
    return quote;
  }
  quote(id?: string): CurrencyQuote | undefined {
    const row = (
      id
        ? this.store.db
            .prepare("SELECT data FROM currency_quotes WHERE id=?")
            .get(id)
        : this.store.db
            .prepare(
              "SELECT data FROM currency_quotes ORDER BY updated_at DESC LIMIT 1",
            )
            .get()
    ) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as CurrencyQuote) : undefined;
  }
  async current(): Promise<CurrencyQuote> {
    const cached = this.quote()!;
    if (this.now() < Date.parse(cached.nextUpdateAt)) return cached;
    if (this.pending) return this.pending;
    if (this.now() - this.lastAttempt < 3600000) return cached;
    this.lastAttempt = this.now();
    this.pending = (async () => {
      try {
        const r = await this.fetcher("https://open.er-api.com/v6/latest/USD", {
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return cached;
        const data = (await r.json()) as {
          result?: string;
          base_code?: string;
          time_last_update_unix?: number;
          time_next_update_unix?: number;
          rates?: { NGN?: number };
        };
        const rate = data.rates?.NGN,
          updated = data.time_last_update_unix,
          next = data.time_next_update_unix;
        if (
          data.result !== "success" ||
          data.base_code !== "USD" ||
          typeof rate !== "number" ||
          !Number.isFinite(rate) ||
          rate <= 0 ||
          rate > 1000000 ||
          !Number.isSafeInteger(updated) ||
          !Number.isSafeInteger(next) ||
          next! <= updated! ||
          updated! * 1000 > this.now() + 300000 ||
          updated! * 1000 < Date.parse(cached.updatedAt)
        )
          return cached;
        return this.save({
          id: `usd-ngn-${updated}-${rate}`,
          ngnPerUsd: rate,
          updatedAt: new Date(updated! * 1000).toISOString(),
          nextUpdateAt: new Date(next! * 1000).toISOString(),
          source: referenceQuote.source,
        });
      } catch {
        return cached;
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
}
