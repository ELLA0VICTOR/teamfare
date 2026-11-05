import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayAmount,
  sourceAmount,
  convertedMoney,
  referenceQuote,
  sourceCurrencyText,
} from "../../src/currency.ts";
import { expenseCsv } from "../../src/workflows.ts";
import type { Expense } from "../../src/data.ts";
import { Store } from "../store.ts";
import { CurrencyService } from "../currency.ts";

test("currency conversion preserves canonical NGN and supports dollar cents", () => {
  const quote = { ...referenceQuote, ngnPerUsd: 1500 };
  assert.equal(displayAmount(30000, "USD", quote), 20);
  assert.equal(sourceAmount(8.25, "USD", quote), 12375);
  assert.equal(sourceAmount(12375, "NGN", quote), 12375);
  assert.equal(convertedMoney(12375, "USD", quote), "$8.25");
  assert.equal(displayAmount(30000, "NGN", quote), 30000);
  const old = { amount: 12000 };
  const untouched = JSON.stringify(old);
  displayAmount(old.amount, "USD", quote);
  assert.equal(JSON.stringify(old), untouched);
});
test("only rendered narratives convert; source evidence remains untouched", () => {
  const quote = { ...referenceQuote, ngnPerUsd: 1500 },
    source = "Meal NGN18,000 per person; deposit ₦30,000.";
  assert.equal(
    sourceCurrencyText(source, "USD", quote),
    "Meal $12.00 per person; deposit $20.00.",
  );
  assert.equal(sourceCurrencyText(source, "NGN", quote), source);
  assert.equal(sourceCurrencyText("12000 naira", "USD", quote), "$8.00");
});
test("USD CSV retains original amounts, reference rate and formula protection", () => {
  const expenses = [
    {
      id: "e",
      planId: "p",
      description: "=SUM(1,2)",
      amount: 12000,
      payer: "Team",
      date: "2026-11-05",
      category: "Food",
    },
  ] as Expense[];
  const native = expenseCsv(expenses, []),
    usd = expenseCsv(expenses, [], {
      currency: "USD",
      quote: { ...referenceQuote, ngnPerUsd: 1500 },
    });
  assert.match(native, /Amount \(NGN\)/);
  assert.doesNotMatch(native, /Amount \(USD\)/);
  assert.match(usd, /Amount \(USD\)/);
  assert.match(usd, /Original amount \(NGN\)/);
  assert.match(usd, /"8.00","12000","1500"/);
  assert.match(usd, /'=SUM\(1,2\)/);
  assert.equal(expenses[0].amount, 12000);
});
test("currency snapshots survive a database reload and unknown quotes are rejected", async () => {
  const store = new Store(":memory:");
  try {
    const first = new CurrencyService(store);
    assert.equal(first.quote("unknown"), undefined);
    const next = new CurrencyService(store, {
      now: () => Date.parse(referenceQuote.updatedAt) + 1000,
    });
    assert.deepEqual(next.quote(referenceQuote.id), referenceQuote);
    assert.equal((await next.current()).ngnPerUsd, referenceQuote.ngnPerUsd);
  } finally {
    store.close();
  }
});
test("FX refresh keeps auditable snapshots and provider outages retain a dated rate", async () => {
  const store = new Store(":memory:");
  try {
    const now = Date.parse(referenceQuote.nextUpdateAt) + 1000;
    let calls = 0;
    const service = new CurrencyService(store, {
      now: () => now,
      fetcher: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            result: "success",
            base_code: "USD",
            time_last_update_unix: Math.floor(now / 1000),
            time_next_update_unix: Math.floor(now / 1000) + 86400,
            rates: { NGN: 1500 },
          }),
        );
      },
    });
    const [a, b] = await Promise.all([service.current(), service.current()]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.equal(a.ngnPerUsd, 1500);
    assert.deepEqual(service.quote(referenceQuote.id), referenceQuote);
    const failure = new CurrencyService(store, {
      now: () => now + 172800000,
      fetcher: async () => {
        throw Error("offline");
      },
    });
    assert.deepEqual(await failure.current(), a);
  } finally {
    store.close();
  }
});
