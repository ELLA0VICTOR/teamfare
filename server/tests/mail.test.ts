import { test } from "node:test";
import assert from "node:assert/strict";
import { resendMailer } from "../mail.ts";

test("transactional email uses the configured sender, bearer auth and idempotency without exposing provider errors", async (t) => {
  const old = {
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    fetch: globalThis.fetch,
  };
  process.env.RESEND_API_KEY = "re_test_only_not_a_real_key";
  process.env.EMAIL_FROM = "Teamfare <noreply@example.test>";
  t.after(() => {
    if (old.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = old.key;
    if (old.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = old.from;
    globalThis.fetch = old.fetch;
  });
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests++;
    assert.equal(url, "https://api.resend.com/emails");
    const headers = init!.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer re_test_only_not_a_real_key");
    assert.equal(headers["Idempotency-Key"], "test-mail-1");
    const data = JSON.parse(String(init!.body));
    assert.equal(data.from, "Teamfare <noreply@example.test>");
    assert.deepEqual(data.to, ["owner@example.test"]);
    return Response.json({ id: "accepted-test-email" });
  };
  const mailer = resendMailer();
  await mailer.send({
    id: "test-mail-1",
    to: "owner@example.test",
    subject: "Verify",
    text: "A test-only email.",
  });
  assert.equal(requests, 1);
  globalThis.fetch = async () =>
    new Response("provider echoed re_test_only_not_a_real_key", {
      status: 403,
    });
  await assert.rejects(
    mailer.send({
      id: "test-mail-1",
      to: "owner@example.test",
      subject: "Verify",
      text: "A test-only email.",
    }),
    (error) =>
      error instanceof Error && !error.message.includes("re_test_only"),
  );
});
