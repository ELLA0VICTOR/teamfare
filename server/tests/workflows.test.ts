import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createApp, verifiedAccount } from "./helpers.ts";
import { Store } from "../store.ts";
import { WorkflowService } from "../workflow-service.ts";
import { backupDatabase } from "../backup.ts";
import { calendarFile, expenseCsv, outingStart } from "../../src/workflows.ts";
import type { Plan } from "../../src/data.ts";
import type { MailMessage } from "../mail.ts";

const origin = "http://localhost:5173",
  password = "Workflow test passphrase 2026!",
  secret = "test-only-secret-with-at-least-32-characters";
const date = (offset = 3) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "teamfare-workflows-")),
    path = join(dir, "team.sqlite"),
    app = await createApp({ databasePath: path, authLimit: 100 }),
    store = new Store(path);
  t.after(async () => {
    await app.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const manager = await verifiedAccount(app, "/api/auth/register", origin, {
    name: "Manager",
    email: "manager@example.test",
    password,
    teamName: "Workflow team",
    outingEmails: true,
  });
  const headers = (response: typeof manager) => ({
    origin,
    cookie: response.cookies[0].name + "=" + response.cookies[0].value,
    "x-csrf-token": response.json().csrfToken,
  });
  const post = (
    who: typeof manager,
    url: string,
    payload: unknown,
    method: "POST" | "PUT" | "DELETE" = "POST",
  ) =>
    app.inject({
      method,
      url,
      headers: headers(who),
      payload: payload as object,
    });
  const invite = await post(manager, "/api/invites", { role: "employee" });
  const employee = await verifiedAccount(app, "/api/auth/join", origin, {
    name: "Organiser",
    email: "organiser@example.test",
    password,
    inviteCode: invite.json().code,
    outingEmails: true,
  });
  const other = await verifiedAccount(app, "/api/auth/register", origin, {
    name: "Outside",
    email: "other@example.test",
    password,
    teamName: "Other team",
  });
  const draft = {
    experienceId: "long-table",
    title: "Workflow outing",
    date: date(),
    time: "13:00",
    people: 2,
    budget: 100000,
    location: "Lagos",
    note: "Confirm with the venue",
    attendees: [employee.json().user.id, manager.json().user.id],
    emailGuests: true,
    durationMinutes: 120,
  };
  const created = await post(employee, "/api/plans", draft);
  assert.equal(created.statusCode, 201, created.body);
  return {
    app,
    store,
    path,
    dir,
    manager,
    employee,
    other,
    headers,
    post,
    draft,
    plan: created.json() as Plan,
  };
}

test("availability uses explicit versioned replies, ranks honestly and requires conflict acknowledgement", async (t) => {
  const f = await setup(t),
    base = `/api/plans/${f.plan.id}/availability`;
  const created = await f.post(f.employee, base, {
    version: 0,
    slots: [
      { date: date(), time: "13:00", durationMinutes: 120 },
      { date: date(4), time: "14:00", durationMinutes: 90 },
    ],
  });
  assert.equal(created.statusCode, 200, created.body);
  const poll = created.json();
  assert.equal(poll.ranking[0].available, 0);
  assert.equal(poll.ranking[0].unknown, 2);
  assert.equal(
    (await f.post(f.other, base + "/reply", { version: 1, available: [] }))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await f.post(f.employee, base + "/reply", {
        version: 1,
        available: [randomUUID()],
      })
    ).statusCode,
    400,
  );
  const response = await f.post(f.manager, base + "/reply", {
    version: 1,
    available: [poll.slots[0].id],
  });
  assert.equal(response.json().ranking[0].available, 1);
  assert.equal(response.json().ranking[0].unknown, 1);
  assert.equal(
    (
      await f.post(f.manager, base + "/apply", {
        version: 1,
        revision: 1,
        slotId: poll.slots[0].id,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.post(f.employee, base + "/apply", {
        version: 1,
        revision: 1,
        slotId: poll.slots[0].id,
      })
    ).statusCode,
    400,
  );
  const picked = await f.post(f.employee, base + "/apply", {
    version: 1,
    revision: 1,
    slotId: poll.slots[0].id,
    acknowledgeConflicts: true,
  });
  assert.equal(picked.statusCode, 200, picked.body);
  assert.equal(picked.json().time, "13:00");
  assert.equal(picked.json().revision, 2);
  assert.equal(
    (await f.post(f.manager, base + "/reply", { version: 1, available: [] }))
      .statusCode,
    409,
  );
  const reopened = await f.post(f.employee, base, {
    version: 1,
    slots: [
      { date: date(5), time: "13:00", durationMinutes: 120 },
      { date: date(6), time: "14:00", durationMinutes: 120 },
    ],
  });
  assert.equal(reopened.json().version, 2);
  assert.deepEqual(reopened.json().replies, []);
  assert.equal(
    (
      await f.post(f.employee, base, {
        version: 1,
        slots: [
          { date: date(5), time: "13:00", durationMinutes: 120 },
          { date: date(6), time: "14:00", durationMinutes: 120 },
        ],
      })
    ).statusCode,
    409,
  );
});

test("approval queues opt-in invitations/reminders atomically and cancellation stops unsent work", async (t) => {
  const f = await setup(t);
  const submitted = await f.post(
    f.employee,
    `/api/plans/${f.plan.id}`,
    { ...f.draft, revision: 1, submit: true },
    "PUT",
  );
  assert.equal(submitted.statusCode, 200, submitted.body);
  const approved = await f.post(f.manager, `/api/plans/${f.plan.id}/action`, {
    action: "approve",
    revision: 2,
  });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(
    f.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND kind='invitation'",
      )
      .get(f.plan.id)?.n,
    2,
  );
  assert.equal(
    f.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND kind='reminder'",
      )
      .get(f.plan.id)?.n,
    4,
  );
  assert.equal(
    (
      await f.post(f.manager, `/api/plans/${f.plan.id}/action`, {
        action: "approve",
        revision: 2,
      })
    ).statusCode,
    409,
  );
  const calendar = await f.app.inject({
    url: `/api/plans/${f.plan.id}/calendar`,
    headers: f.headers(f.employee),
  });
  assert.equal(calendar.statusCode, 200);
  assert.match(calendar.body, /DTSTART:.*T120000Z/);
  assert.match(calendar.body, /DTEND:.*T140000Z/);
  const requestId = randomUUID();
  await f.post(f.employee, `/api/plans/${f.plan.id}/invitations`, {
    requestId,
  });
  const count = f.store.db
    .prepare("SELECT count(*) AS n FROM workflow_emails WHERE plan_id=?")
    .get(f.plan.id)?.n;
  await f.post(f.employee, `/api/plans/${f.plan.id}/invitations`, {
    requestId,
  });
  assert.equal(
    f.store.db
      .prepare("SELECT count(*) AS n FROM workflow_emails WHERE plan_id=?")
      .get(f.plan.id)?.n,
    count,
  );
  assert.equal(
    f.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND kind='reminder'",
      )
      .get(f.plan.id)?.n,
    4,
  );
  const current = f.store.plan(f.plan.id, f.manager.json().team.id)!;
  assert.equal(
    (
      await f.post(f.employee, `/api/plans/${f.plan.id}/action`, {
        action: "cancel",
        revision: current.revision,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    f.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND status='pending' AND kind IN ('invitation','reminder','review')",
      )
      .get(f.plan.id)?.n,
    0,
  );
  assert.equal(
    f.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND kind='cancellation'",
      )
      .get(f.plan.id)?.n,
    2,
  );
});

test("reminders wait for their deadlines, survive a worker restart and skip declined guests", async (t) => {
  const f = await setup(t);
  await f.post(
    f.employee,
    `/api/plans/${f.plan.id}`,
    { ...f.draft, revision: 1, submit: true },
    "PUT",
  );
  const response = await f.post(f.manager, `/api/plans/${f.plan.id}/action`, {
    action: "approve",
    revision: 2,
  });
  const plan = response.json() as Plan;
  f.store.db
    .prepare("DELETE FROM workflow_emails WHERE team_id=?")
    .run(f.manager.json().team.id);
  let now = Date.now();
  const sent: MailMessage[] = [],
    options = {
      secret,
      now: () => now,
      mailer: {
        async send(message: MailMessage) {
          sent.push(message);
        },
      },
    };
  const worker = new WorkflowService(f.store, origin, options);
  worker.invite(plan, f.manager.json().team.id, "deadline-check");
  await worker.flush();
  assert.equal(sent.length, 2);
  now = outingStart(plan).getTime() - 24 * 3600000 - 1;
  await worker.flush();
  assert.equal(sent.length, 2, "No reminder may be sent early");
  await f.post(f.employee, `/api/plans/${plan.id}/rsvp`, {
    revision: plan.revision,
    going: false,
  });
  now += 2;
  await worker.flush();
  assert.equal(sent.length, 3);
  assert.equal(sent.at(-1)!.to, f.manager.json().user.email);
  await worker.close();
  const restarted = new WorkflowService(f.store, origin, options);
  now = outingStart(plan).getTime() - 2 * 3600000 + 1;
  await restarted.flush();
  await restarted.flush();
  assert.equal(
    sent.length,
    4,
    "Only the remaining guest gets one reminder per deadline",
  );
  const rows = f.store.db
    .prepare(
      "SELECT status,count(*) AS n FROM workflow_emails WHERE kind='reminder' GROUP BY status",
    )
    .all();
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.status, r.n])), {
    accepted: 2,
    cancelled: 2,
  });
  await restarted.close();
});

test("receipts are bounded, private, durable in backups and linked to idempotent expenses", async (t) => {
  const f = await setup(t);
  await f.post(
    f.employee,
    `/api/plans/${f.plan.id}`,
    { ...f.draft, revision: 1, submit: true },
    "PUT",
  );
  await f.post(f.manager, `/api/plans/${f.plan.id}/action`, {
    action: "approve",
    revision: 2,
  });
  const payload = {
    requestId: randomUUID(),
    planId: f.plan.id,
    description: "Meal",
    amount: 12000,
    date: date(0),
    payer: f.employee.json().user.id,
    category: "Food & drinks",
  };
  const made = await f.post(f.employee, "/api/expenses", payload),
    same = await f.post(f.employee, "/api/expenses", payload);
  assert.equal(made.statusCode, 201, made.body);
  assert.equal(same.json().id, made.json().id);
  assert.equal(
    (await f.post(f.employee, "/api/expenses", { ...payload, amount: 13000 }))
      .statusCode,
    409,
  );
  const url = `/api/expenses/${made.json().id}/receipt`,
    pdf = Buffer.from("%PDF-1.4\nReceipt fixture\n%%EOF");
  const upload = (body: Buffer, who = f.employee, type = "application/pdf") =>
    f.app.inject({
      method: "POST",
      url,
      headers: {
        ...f.headers(who),
        "content-type": type,
        "x-receipt-name": encodeURIComponent("../receipt\r\nfile.pdf"),
      },
      payload: body,
    });
  assert.equal((await upload(pdf, f.other)).statusCode, 404);
  assert.equal(
    (await upload(Buffer.from("<html>not a PDF</html>"))).statusCode,
    400,
  );
  assert.equal(
    (await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).statusCode,
    413,
  );
  const attached = await upload(pdf);
  assert.equal(attached.statusCode, 201, attached.body);
  assert.equal((await upload(pdf)).json().id, attached.json().id);
  const downloaded = await f.app.inject({ url, headers: f.headers(f.manager) });
  assert.equal(downloaded.statusCode, 200);
  assert.deepEqual(downloaded.rawPayload, pdf);
  assert.match(
    String(downloaded.headers["content-disposition"]),
    /^attachment;/,
  );
  const state = await f.app.inject({
    url: "/api/state",
    headers: f.headers(f.employee),
  });
  assert.equal(state.json().state.expenses[0].receipt.id, attached.json().id);
  assert.equal(
    JSON.stringify(state.json()).includes(pdf.toString("base64")),
    false,
  );
  await backupDatabase(f.path, join(f.dir, "receipts.sqlite"));
  const restored = new DatabaseSync(join(f.dir, "receipts.sqlite"), {
    readOnly: true,
  });
  try {
    assert.deepEqual(
      Buffer.from(
        restored.prepare("SELECT bytes FROM receipts").get()!
          .bytes as Uint8Array,
      ),
      pdf,
    );
  } finally {
    restored.close();
  }
  assert.equal(
    (await f.post(f.employee, url, { receiptId: randomUUID() }, "DELETE"))
      .statusCode,
    409,
  );
  assert.equal(
    (await f.post(f.employee, url, { receiptId: attached.json().id }, "DELETE"))
      .statusCode,
    200,
  );
});

test("reports and addressed team invitations are scoped, encrypted and idempotent", async (t) => {
  const f = await setup(t),
    invite = await f.post(f.manager, "/api/invites", { role: "employee" });
  const sent = await f.post(
    f.manager,
    `/api/invites/${invite.json().id}/email`,
    { email: "new@example.test", code: invite.json().code },
  );
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(sent.json().status, "pending");
  const job = f.store.db
    .prepare("SELECT payload FROM workflow_emails WHERE id=?")
    .get(sent.json().id)!;
  assert.equal(String(job.payload).includes(invite.json().code), false);
  assert.equal(
    (
      await f.post(f.manager, `/api/invites/${invite.json().id}/email`, {
        email: "other@example.test",
        code: invite.json().code,
      })
    ).statusCode,
    409,
  );
  const wrong = await f.post(f.manager, "/api/auth/join", {
    name: "Wrong recipient",
    email: "wrong@example.test",
    password,
    confirmPassword: password,
    inviteCode: invite.json().code,
  });
  assert.equal(wrong.statusCode, 400);
  await f.post(
    f.employee,
    `/api/plans/${f.plan.id}`,
    { ...f.draft, revision: 1, submit: true },
    "PUT",
  );
  await f.post(f.manager, `/api/plans/${f.plan.id}/action`, {
    action: "approve",
    revision: 2,
  });
  await f.post(f.employee, "/api/expenses", {
    planId: f.plan.id,
    description: "=sum(1)",
    amount: 12000,
    date: date(0),
    payer: f.employee.json().user.id,
    category: "Food & drinks",
  });
  const input = {
    recipientId: f.manager.json().user.id,
    requestId: randomUUID(),
    from: date(0),
    to: date(0),
  };
  assert.equal(
    (await f.post(f.employee, "/api/reports/expenses/email", input)).statusCode,
    403,
  );
  assert.equal(
    (
      await f.post(f.manager, "/api/reports/expenses/email", {
        ...input,
        recipientId: f.other.json().user.id,
      })
    ).statusCode,
    400,
  );
  const report = await f.post(f.manager, "/api/reports/expenses/email", input);
  assert.equal(report.statusCode, 200, report.body);
  assert.equal(
    (await f.post(f.manager, "/api/reports/expenses/email", input)).json().id,
    report.json().id,
  );
  assert.equal(
    (
      await f.post(f.manager, "/api/reports/expenses/email", {
        ...input,
        requestId: randomUUID(),
        from: date(2),
        to: date(1),
      })
    ).statusCode,
    400,
  );
  const messages: MailMessage[] = [];
  const service = new WorkflowService(f.store, origin, {
    secret,
    mailer: {
      async send(message) {
        messages.push(message);
      },
    },
  });
  for (let i = 0; i < 5; i++) await service.flush();
  await service.close();
  const actual = messages.find((m) => m.id === "workflow/" + report.json().id)!;
  assert.ok(actual);
  const csv = Buffer.from(actual.attachments![0].content, "base64").toString();
  assert.match(csv, /'=sum\(1\)/);
  assert.match(csv, /12000/);
});

test("the durable outbox retries with the same provider key, recovers leases and observes preferences", async (t) => {
  const f = await setup(t);
  let now = Date.now(),
    fail = true;
  const attempted: MailMessage[] = [];
  const service = new WorkflowService(f.store, origin, {
    secret,
    now: () => now,
    mailer: {
      async send(message) {
        attempted.push(message);
        if (fail) throw Error("private provider text must not escape");
      },
    },
  });
  const recipient = f.store.user(f.manager.json().user.id)!;
  const input = {
    teamId: recipient.team_id,
    recipient,
    kind: "review",
    dedupe: "retry-test",
    subject: "Review",
    text: "Sensitive note",
  };
  const id = service.enqueue(input);
  assert.equal(service.enqueue(input), id);
  await service.flush();
  assert.equal(service.status(id), "pending");
  fail = false;
  now += 61000;
  await service.flush();
  assert.equal(service.status(id), "accepted");
  assert.equal(attempted[0].id, attempted[1].id);
  const recovered = service.enqueue({ ...input, dedupe: "lease-test" });
  f.store.db
    .prepare(
      "UPDATE workflow_emails SET status='sending',attempts=1,first_attempt_at=?,lease_until=? WHERE id=?",
    )
    .run(now - 1000, now - 1, recovered);
  await service.flush();
  assert.equal(service.status(recovered), "accepted");
  const optedOut = service.enqueue({ ...input, dedupe: "opt-out" });
  f.store.db
    .prepare("UPDATE users SET outing_emails=0 WHERE id=?")
    .run(recipient.id);
  await service.flush();
  assert.equal(service.status(optedOut), "suppressed");
  assert.equal(
    JSON.stringify(service.list(recipient.team_id, recipient)).includes(
      "Sensitive note",
    ),
    false,
  );
  await service.close();
});

test("calendar and CSV serialization cannot inject fields and UTF-8 lines remain folded", () => {
  const plan = {
    id: "calendar",
    title: "A long outing " + "é".repeat(90) + "\r\nBEGIN:VEVENT",
    date: date(),
    time: "13:00",
    durationMinutes: 90,
    location: "Lagos; room, one",
    note: "Line one\nLine two",
    status: "Approved",
    revision: 2,
  } as Plan;
  const calendar = calendarFile(plan, "https://teamfare.example");
  assert.equal(calendar.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.equal(calendar.match(/^BEGIN:VEVENT$/gm)?.length, 1);
  assert.ok(
    calendar.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
  );
  assert.match(calendar, /DTEND:.*T133000Z/);
  const csv = expenseCsv(
    [
      {
        id: "e",
        planId: plan.id,
        description: '\t=HYPERLINK("bad")',
        amount: 20,
        payer: "Person",
        date: date(),
        category: "Other",
      },
    ],
    [plan],
  );
  assert.ok(csv.includes("'\t=HYPERLINK"));
});

test("authenticated teammates have independent request budgets behind the same IP", async (t) => {
  const f = await setup(t);
  let limited = false;
  for (let i = 0; i < 181; i++) {
    const r = await f.app.inject({
      url: "/api/health",
      headers: f.headers(f.employee),
    });
    if (r.statusCode === 429) limited = true;
  }
  assert.equal(limited, true);
  assert.equal(
    (await f.app.inject({ url: "/api/health", headers: f.headers(f.manager) }))
      .statusCode,
    200,
  );
  assert.equal(
    (await f.app.inject({ url: "/api/health", headers: { origin } }))
      .statusCode,
    200,
  );
});
