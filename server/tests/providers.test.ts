import { test } from "node:test";
import assert from "node:assert/strict";
import { createProviders } from "../agent/providers.ts";

test("provider adapters send the documented auth and tool payloads and parse real API shapes", async (t) => {
  const seen: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    seen.push({
      url,
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body)),
    });
    if (url.includes("chat/completions"))
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-search",
                  type: "function",
                  function: {
                    name: "web_search",
                    arguments: '{"query":"lunch"}',
                  },
                },
              ],
            },
          },
        ],
      });
    if (url.endsWith("/search"))
      return Response.json({
        results: [
          {
            url: "https://example.com/menu",
            title: "Menu",
            content: "A menu.",
          },
        ],
      });
    return Response.json({
      results: [
        { url: "https://example.com/menu", raw_content: "A full menu." },
      ],
      failed_results: [],
    });
  });
  const providers = createProviders(),
    signal = AbortSignal.timeout(5000);
  const message = await providers.complete(
    [{ role: "user", content: "Plan an outing." }],
    [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search venues",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ],
    signal,
  );
  assert.equal(message.tool_calls?.[0].function.name, "web_search");
  assert.equal(
    (await providers.search("lunch Lagos", signal))[0].title,
    "Menu",
  );
  assert.equal(
    (await providers.extract(["https://example.com/menu"], signal))[0].content,
    "A full menu.",
  );
  assert.equal(
    seen[0].url,
    "https://api.vultrinference.com/v1/chat/completions",
  );
  assert.equal(seen[0].body.tool_choice, "required");
  assert.equal(seen[0].body.max_completion_tokens, 8192);
  assert.deepEqual(seen[0].body.reasoning, { effort: "low", max_tokens: 1024 });
  assert.equal(seen[1].url, "https://api.tavily.com/search");
  assert.equal(seen[1].body.include_answer, false);
  assert.equal(seen[2].body.format, "text");
  assert.ok(seen.every((request) => request.headers.has("authorization")));
});

test("provider errors never echo credential-bearing response bodies", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("secret-fixture-value", { status: 401 }),
  );
  await assert.rejects(
    createProviders().search("venue Lagos", AbortSignal.timeout(1000)),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /credentials/);
      assert.equal(error.message.includes("secret-fixture-value"), false);
      return true;
    },
  );
});

test("provider responses are size bounded", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("x".repeat(2000001), { status: 200 }),
  );
  await assert.rejects(
    createProviders().search("venue Lagos", AbortSignal.timeout(1000)),
    /too much data/,
  );
});

test("a truncated model response never becomes an executable tool call", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-truncated",
                type: "function",
                function: { name: "submit_options", arguments: '{"options":[' },
              },
            ],
          },
        },
      ],
    }),
  );
  await assert.rejects(
    createProviders().complete([], [], AbortSignal.timeout(1000)),
    /ran out of output space/,
  );
});
