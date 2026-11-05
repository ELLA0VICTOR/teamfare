import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp, verifiedAccount } from "./helpers.ts";
import { runResearch, publicUrl } from "../agent/runner.ts";
import { costTotal } from "../../src/research.ts";
import { fixtureProviders } from "./fixtures/research-provider.ts";
import type { ResearchRun } from "../../src/research.ts";

const origin = "http://localhost:5173",
  password = "Research-fixture-password!";
const input = {
  brief: "A relaxed lunch for eight colleagues with vegan options.",
  people: 8,
  location: "Lagos",
  date: "2099-11-12",
  perPerson: 25000,
  preference: "Vegan options",
};
type App = Awaited<ReturnType<typeof createApp>>;
async function account(app: App, email: string) {
  const reply = await verifiedAccount(app, "/api/auth/register", origin, {
    name: "Research Organiser",
    email,
    password,
    teamName: "Research test",
  });
  return {
    cookie: `${reply.cookies[0].name}=${reply.cookies[0].value}`,
    csrf: reply.json().csrfToken,
  };
}
function headers(user: { cookie: string; csrf: string }) {
  return { origin, cookie: user.cookie, "x-csrf-token": user.csrf };
}
async function finished(
  app: App,
  id: string,
  user: { cookie: string; csrf: string },
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const run = (
      await app.inject({ url: `/api/research/${id}`, headers: headers(user) })
    ).json() as ResearchRun;
    if (run.status !== "running") return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Research did not finish within the test limit.");
}

test("tool loop reads evidence, verifies published quotes and computes mixed-unit costs", async () => {
  const events: string[] = [];
  const result = await runResearch(
    input,
    fixtureProviders(),
    AbortSignal.timeout(5000),
    (text) => events.push(text),
  );
  assert.equal(result.options.length, 2);
  assert.equal(costTotal(result.options[0].costs, 8), 152000);
  assert.equal(costTotal(result.options[0].costs, 6), 116000);
  assert.equal(result.options[0].sources[0].read, true);
  assert.ok(result.options[0].sources[0].fetchedAt);
  assert.ok(
    result.options[0].openQuestions.some((question) =>
      question.includes("2099-11-12"),
    ),
  );
  assert.ok(events.some((text) => text.startsWith("Read 2")));
  assert.ok(events.at(-1)?.includes("Compared 2"));
  assert.equal(result.recommendedOptionId, result.options[0].id);
});

test("late proposal corrections retain a bounded submission phase and expose validation feedback", async () => {
  const base = fixtureProviders(),
    events: string[] = [];
  const result = await runResearch(
    input,
    {
      ...base,
      async complete(messages, tools, signal) {
        const step = messages.filter(
          (message) => message.role === "assistant",
        ).length;
        if (step >= 9)
          assert.deepEqual(
            tools.map((tool) => tool.function.name),
            ["submit_options"],
          );
        const message = await base.complete(messages, tools, signal);
        if (step >= 2 && step < 9) {
          const args = JSON.parse(message.tool_calls![0].function.arguments);
          args.options[0].costs[0].amount = 8000;
          message.tool_calls![0].function.arguments = JSON.stringify(args);
        }
        return message;
      },
    },
    AbortSignal.timeout(5000),
    (text) => events.push(text),
  );
  assert.equal(result.options.length, 2);
  assert.ok(
    events.some((text) =>
      text.startsWith("Checking the proposal found a correction:"),
    ),
  );
  assert.equal(costTotal(result.options[0].costs, 8), 152000);
});

test("unsupported tools, fabricated source IDs, invented prices and absent evidence never produce an option", async () => {
  for (const mode of [
    "forbidden-tool",
    "bad-source",
    "forged-price",
    "empty",
  ] as const)
    await assert.rejects(
      runResearch(
        input,
        fixtureProviders(mode),
        AbortSignal.timeout(5000),
        () => {},
      ),
      /limit/,
    );
  for (const url of [
    "javascript:alert(1)",
    "http://localhost/admin",
    "http://127.0.0.1/private",
    "https://[::1]/",
    "https://user:secret@example.com",
    "https://private.internal/",
    "https://example.com:8080/",
  ])
    assert.equal(publicUrl(url), null);
  assert.equal(
    publicUrl("https://example.com/menu#prices"),
    "https://example.com/menu",
  );
});

test("research is authenticated, idempotent, private before selection, and saves an editable sourced draft", async (t) => {
  const app = await createApp({
    databasePath: ":memory:",
    origin,
    agentProviders: fixtureProviders(),
    authLimit: 100,
  });
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ url: "/api/research/config" })).statusCode,
    401,
  );
  const owner = await account(app, "owner@example.test"),
    outsider = await account(app, "other@example.test");
  const { preference: _preference, ...fields } = input;
  const payload = { ...fields, requestId: randomUUID() };
  const created = await app.inject({
    method: "POST",
    url: "/api/research",
    headers: headers(owner),
    payload,
  });
  assert.equal(created.statusCode, 200, created.body);
  const id = created.json().id;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/research",
        headers: headers(owner),
        payload,
      })
    ).json().id,
    id,
  );
  assert.equal(
    (
      await app.inject({
        url: `/api/research/${id}`,
        headers: headers(outsider),
      })
    ).statusCode,
    404,
  );
  const run = await finished(app, id, owner);
  assert.equal(run.status, "completed");
  assert.ok(run.result);
  assert.equal(
    (await app.inject({ url: "/api/state", headers: headers(owner) })).json()
      .state.plans.length,
    0,
  );
  const saved = await app.inject({
    method: "POST",
    url: `/api/research/${id}/accept`,
    headers: headers(owner),
    payload: { optionId: run.result!.options[0].id },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  let plan = saved.json();
  assert.equal(plan.status, "Draft");
  assert.equal(plan.experienceId, "researched");
  assert.equal(plan.proposal.runId, id);
  assert.equal(plan.unitPrice, 19000);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/research/${id}/accept`,
        headers: headers(owner),
        payload: { optionId: run.result!.options[0].id },
      })
    ).json().id,
    plan.id,
  );
  const costFields = plan.proposal.costs.map(
    ({
      label,
      amount,
      unit,
    }: {
      label: string;
      amount: number;
      unit: string;
    }) => ({ label, amount, unit }),
  );
  costFields[0].amount = 17000;
  const update = {
    experienceId: "researched",
    title: plan.title,
    date: plan.date,
    time: plan.time,
    people: 6,
    budget: 180000,
    location: plan.location,
    note: plan.note,
    attendees: plan.attendees,
    revision: plan.revision,
    submit: true,
    costs: costFields,
    itinerary: plan.proposal.itinerary,
  };
  const edited = await app.inject({
    method: "PUT",
    url: `/api/plans/${plan.id}`,
    headers: headers(owner),
    payload: update,
  });
  assert.equal(edited.statusCode, 200, edited.body);
  plan = edited.json();
  assert.equal(plan.status, "Awaiting approval");
  assert.equal(plan.proposal.costs[0].basis, "estimate");
  assert.equal(plan.proposal.costs[0].quote, undefined);
  assert.equal(costTotal(plan.proposal.costs, 6), 110000);
  assert.equal(plan.proposal.sources.length, 1);
  assert.equal(
    (await app.inject({ url: "/api/state", headers: headers(owner) })).json()
      .state.researchRuns[0].selectedPlanId,
    plan.id,
  );
});

test("cancellation, provider failure, quotas and missing configuration are explicit", async (t) => {
  const slow = await createApp({
    databasePath: ":memory:",
    origin,
    agentProviders: fixtureProviders("slow"),
    authLimit: 100,
  });
  t.after(() => slow.close());
  const owner = await account(slow, "slow@example.test");
  const { preference: _preference, ...fields } = input;
  const first = (
    await slow.inject({
      method: "POST",
      url: "/api/research",
      headers: headers(owner),
      payload: { ...fields, requestId: randomUUID() },
    })
  ).json();
  assert.equal(
    (
      await slow.inject({
        method: "POST",
        url: "/api/research",
        headers: headers(owner),
        payload: { ...fields, requestId: randomUUID() },
      })
    ).statusCode,
    409,
  );
  const cancelled = await slow.inject({
    method: "POST",
    url: `/api/research/${first.id}/cancel`,
    headers: headers(owner),
    payload: {},
  });
  assert.equal(cancelled.json().status, "cancelled");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    (
      await slow.inject({
        url: `/api/research/${first.id}`,
        headers: headers(owner),
      })
    ).json().status,
    "cancelled",
  );
  const failing = await createApp({
    databasePath: ":memory:",
    origin,
    agentProviders: fixtureProviders("failure"),
    authLimit: 100,
  });
  t.after(() => failing.close());
  const user = await account(failing, "failure@example.test");
  for (let i = 0; i < 4; i++) {
    const response = await failing.inject({
      method: "POST",
      url: "/api/research",
      headers: headers(user),
      payload: { ...fields, requestId: randomUUID() },
    });
    assert.equal(response.statusCode, 200);
    const run = await finished(failing, response.json().id, user);
    assert.equal(run.status, "failed");
    assert.equal(run.error, "Test provider unavailable.");
  }
  assert.equal(
    (
      await failing.inject({
        method: "POST",
        url: "/api/research",
        headers: headers(user),
        payload: { ...fields, requestId: randomUUID() },
      })
    ).statusCode,
    429,
  );
  const keys = [
    "VULTR_INFERENCE_API_KEY",
    "VULTR_INFERENCE_MODEL",
    "TAVILY_API_KEY",
  ];
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key) => delete process.env[key]);
  try {
    const missing = await createApp({
      databasePath: ":memory:",
      origin,
      authLimit: 100,
    });
    t.after(() => missing.close());
    const accountMissing = await account(missing, "missing@example.test");
    assert.equal(
      (
        await missing.inject({
          url: "/api/research/config",
          headers: headers(accountMissing),
        })
      ).json().ready,
      false,
    );
    assert.equal(
      (
        await missing.inject({
          method: "POST",
          url: "/api/research",
          headers: headers(accountMissing),
          payload: { ...fields, requestId: randomUUID() },
        })
      ).statusCode,
      503,
    );
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
