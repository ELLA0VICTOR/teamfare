import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../app.ts";
import { digest } from "../auth.ts";

const origin = "http://localhost:5173";
const password = "Test-only-password-2026!";
type App = Awaited<ReturnType<typeof createApp>>;
type Account = { cookie: string; csrf: string; id: string; email: string };
async function register(
  app: App,
  name = "Manager One",
  email = "manager@example.test",
): Promise<Account> {
  const result = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin },
    payload: { name, email, password, teamName: `${name} team` },
  });
  assert.equal(result.statusCode, 201, result.body);
  return {
    cookie: result.cookies[0].name + "=" + result.cookies[0].value,
    csrf: result.json().csrfToken,
    id: result.json().user.id,
    email,
  };
}
async function request(
  app: App,
  account: Account,
  method: "POST" | "PUT" | "GET",
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    headers: { origin, cookie: account.cookie, "x-csrf-token": account.csrf },
    payload,
  });
}
async function joinTeam(
  app: App,
  manager: Account,
  email = "employee@example.test",
  role = "employee",
): Promise<Account> {
  const invitation = await request(app, manager, "POST", "/api/invites", {
    role,
  });
  assert.equal(invitation.statusCode, 200, invitation.body);
  const joined = await app.inject({
    method: "POST",
    url: "/api/auth/join",
    headers: { origin },
    payload: {
      name: "Employee One",
      email,
      password,
      inviteCode: invitation.json().code,
    },
  });
  assert.equal(joined.statusCode, 201, joined.body);
  assert.equal(joined.json().user.role, role);
  return {
    cookie: joined.cookies[0].name + "=" + joined.cookies[0].value,
    csrf: joined.json().csrfToken,
    id: joined.json().user.id,
    email,
  };
}
const details = (creator: Account) => ({
  experienceId: "long-table",
  title: "Our shared lunch",
  date: "2099-11-12",
  time: "13:00",
  people: 8,
  budget: 180000,
  location: "Lagos",
  note: "",
  attendees: [creator.id],
});

test("shared workflow is durable across accounts and rejects forged authority and stale revisions", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "teamfare-api-"));
  const databasePath = join(dir, "test.sqlite");
  let app = await createApp({ databasePath, origin, authLimit: 100 });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const manager = await register(app);
  const employee = await joinTeam(app, manager);
  const outsider = await register(app, "Other Manager", "other@example.test");
  const created = await request(
    app,
    employee,
    "POST",
    "/api/plans",
    details(employee),
  );
  assert.equal(created.statusCode, 201, created.body);
  let plan = created.json();
  assert.equal(plan.unitPrice * plan.people, 148000);
  const forged = await request(app, employee, "PUT", `/api/plans/${plan.id}`, {
    ...details(employee),
    revision: 1,
    submit: true,
    status: "Approved",
    unitPrice: 1,
  });
  assert.equal(forged.statusCode, 400);
  const submitted = await request(
    app,
    employee,
    "PUT",
    `/api/plans/${plan.id}`,
    { ...details(employee), revision: 1, submit: true },
  );
  assert.equal(submitted.statusCode, 200, submitted.body);
  plan = submitted.json();
  assert.equal(
    (
      await request(app, employee, "POST", `/api/plans/${plan.id}/action`, {
        action: "approve",
        revision: plan.revision,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request(app, outsider, "POST", `/api/plans/${plan.id}/action`, {
        action: "approve",
        revision: plan.revision,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await request(app, manager, "POST", `/api/plans/${plan.id}/action`, {
        action: "request-changes",
        revision: plan.revision,
        note: "  ",
      })
    ).statusCode,
    400,
  );
  const returned = await request(
    app,
    manager,
    "POST",
    `/api/plans/${plan.id}/action`,
    {
      action: "request-changes",
      revision: plan.revision,
      note: "Please start later.",
    },
  );
  assert.equal(returned.statusCode, 200);
  plan = returned.json();
  assert.equal(plan.reviewNote, "Please start later.");
  assert.equal(
    (
      await request(app, employee, "PUT", `/api/plans/${plan.id}`, {
        ...details(employee),
        revision: 1,
        submit: true,
      })
    ).statusCode,
    409,
  );
  plan = (
    await request(app, employee, "PUT", `/api/plans/${plan.id}`, {
      ...details(employee),
      time: "14:00",
      revision: plan.revision,
      submit: true,
    })
  ).json();
  const approved = await request(
    app,
    manager,
    "POST",
    `/api/plans/${plan.id}/action`,
    { action: "approve", revision: plan.revision },
  );
  assert.equal(approved.statusCode, 200);
  plan = approved.json();
  const rsvp = await request(
    app,
    employee,
    "POST",
    `/api/plans/${plan.id}/rsvp`,
    { going: true, revision: plan.revision },
  );
  assert.equal(rsvp.statusCode, 200);
  plan = rsvp.json();
  assert.deepEqual(plan.going, [employee.id]);
  const expense = {
    planId: plan.id,
    description: "Lunch deposit",
    amount: 60000,
    date: "2025-01-01",
    payer: employee.id,
    category: "Food & drinks",
  };
  assert.equal(
    (
      await request(app, employee, "POST", "/api/expenses", {
        ...expense,
        payer: manager.id,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await request(app, employee, "POST", "/api/expenses", expense)).statusCode,
    201,
  );
  const managerState = (
    await request(app, manager, "GET", "/api/state")
  ).json();
  assert.equal(managerState.state.expenses[0].amount, 60000);
  assert.equal(
    managerState.state.plans[0].events.some((event: { text: string }) =>
      event.text.includes("Employee One is going"),
    ),
    true,
  );
  assert.deepEqual(
    (await request(app, outsider, "GET", "/api/state")).json().state.plans,
    [],
  );
  await app.close();
  app = await createApp({ databasePath, origin, authLimit: 100 });
  const restored = (await request(app, employee, "GET", "/api/state")).json();
  assert.equal(restored.state.plans[0].status, "Approved");
  assert.equal(restored.state.expenses[0].description, "Lunch deposit");
  const cancelled = await request(
    app,
    manager,
    "POST",
    `/api/plans/${plan.id}/action`,
    { action: "cancel", revision: restored.state.plans[0].revision },
  );
  assert.equal(cancelled.statusCode, 200);
  assert.equal(
    (await request(app, employee, "POST", "/api/expenses", expense)).statusCode,
    409,
  );
  assert.equal(
    (
      await request(app, employee, "POST", `/api/plans/${plan.id}/rsvp`, {
        going: false,
        revision: cancelled.json().revision,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request(app, manager, "GET", "/api/state")).json().state.expenses
      .length,
    1,
  );
  const raw = new DatabaseSync(databasePath);
  const storedUser = raw
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(employee.id)!;
  assert.notEqual(storedUser.password_hash, password);
  const hashes = raw.prepare("SELECT hash FROM sessions").all();
  assert.ok(hashes.every((row) => row.hash !== employee.cookie.split("=")[1]));
  assert.ok(
    hashes.some((row) => row.hash === digest(employee.cookie.split("=")[1])),
  );
  raw.close();
});

test("production serves the built frontend with secure cookies and security headers", async (t) => {
  const httpsOrigin = "https://teamfare.example.test";
  const app = await createApp({
    databasePath: ":memory:",
    origin: httpsOrigin,
    production: true,
    serveStatic: true,
  });
  t.after(() => app.close());
  const home = await app.inject({ method: "GET", url: "/" });
  assert.equal(home.statusCode, 200);
  assert.ok(home.body.includes("Teamfare"));
  assert.ok(home.headers["content-security-policy"]);
  assert.ok(home.headers["strict-transport-security"]);
  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: httpsOrigin },
    payload: {
      name: "Manager",
      email: "production@example.test",
      password,
      teamName: "Production test",
    },
  });
  assert.equal(registered.statusCode, 201);
  const setCookie = String(registered.headers["set-cookie"]);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.equal(registered.headers["cache-control"], "no-store");
  assert.equal(setCookie.includes(password), false);
});

test("sessions, origins, CSRF, invitations, input validation and manager self-approval are enforced", async (t) => {
  const app = await createApp({
    databasePath: ":memory:",
    origin,
    authLimit: 100,
  });
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/state" })).statusCode,
    401,
  );
  const manager = await register(app);
  const badLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin },
    payload: { email: manager.email, password: "wrong-password" },
  });
  assert.equal(badLogin.statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/invites",
        headers: { origin, cookie: manager.cookie },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/invites",
        headers: {
          origin: "https://attacker.test",
          cookie: manager.cookie,
          "x-csrf-token": manager.csrf,
        },
        payload: {},
      })
    ).statusCode,
    403,
  );
  const invite = (
    await request(app, manager, "POST", "/api/invites", { role: "employee" })
  ).json();
  const joinPayload = {
    name: "New Teammate",
    email: "new@example.test",
    password,
    inviteCode: invite.code,
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/join",
        headers: { origin },
        payload: { ...joinPayload, role: "manager" },
      })
    ).statusCode,
    400,
  );
  const joined = await app.inject({
    method: "POST",
    url: "/api/auth/join",
    headers: { origin },
    payload: joinPayload,
  });
  assert.equal(joined.statusCode, 201);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/join",
        headers: { origin },
        payload: { ...joinPayload, email: "reuse@example.test" },
      })
    ).statusCode,
    400,
  );
  const employee = {
    cookie: joined.cookies[0].name + "=" + joined.cookies[0].value,
    csrf: joined.json().csrfToken,
    id: joined.json().user.id,
    email: joinPayload.email,
  };
  assert.equal(
    (await request(app, employee, "POST", "/api/invites", { role: "manager" }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request(app, employee, "POST", "/api/plans", {
        ...details(employee),
        attendees: [manager.id],
      })
    ).statusCode,
    400,
  );
  const plan = (
    await request(app, manager, "POST", "/api/plans", details(manager))
  ).json();
  const submitted = (
    await request(app, manager, "PUT", `/api/plans/${plan.id}`, {
      ...details(manager),
      submit: true,
      revision: 1,
    })
  ).json();
  assert.equal(
    (
      await request(app, manager, "POST", `/api/plans/${plan.id}/action`, {
        action: "approve",
        revision: submitted.revision,
      })
    ).statusCode,
    403,
  );
  const peer = await joinTeam(app, manager, "peer@example.test", "manager");
  assert.equal(
    (
      await request(app, peer, "POST", `/api/plans/${plan.id}/action`, {
        action: "approve",
        revision: submitted.revision,
      })
    ).statusCode,
    200,
  );
  await request(app, employee, "POST", "/api/auth/logout", {});
  assert.equal(
    (await request(app, employee, "GET", "/api/state")).statusCode,
    401,
  );
});

test("account rate limiting and production HTTPS requirements apply", async (t) => {
  const app = await createApp({
    databasePath: ":memory:",
    origin,
    authLimit: 2,
  });
  t.after(() => app.close());
  for (let i = 0; i < 2; i++)
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: { email: "missing@example.test", password: "wrong" },
    });
  const limited = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin },
    payload: { email: "missing@example.test", password: "wrong" },
  });
  assert.equal(limited.statusCode, 429);
  await assert.rejects(
    createApp({ production: true, origin, databasePath: ":memory:" }),
    /HTTPS/,
  );
});
