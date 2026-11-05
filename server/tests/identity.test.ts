import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../app.ts";
import { testMailbox } from "./fixtures/mail.ts";
import { MailError } from "../mail.ts";
import { Store } from "../store.ts";

const origin = "http://localhost:5173",
  password = "A long test passphrase 2026!",
  secret = "test-only-secret-at-least-32-characters";
async function setup(t: TestContext, failMail = false) {
  const dir = await mkdtemp(join(tmpdir(), "teamfare-identity-")),
    databasePath = join(dir, "auth.sqlite"),
    box = testMailbox();
  const mailer = failMail
    ? {
        async send() {
          throw new MailError("Test email unavailable.");
        },
      }
    : box.mailer;
  const app = await createApp({
    databasePath,
    origin,
    mailer,
    authSecret: secret,
    authLimit: 100,
  });
  const db = new DatabaseSync(databasePath);
  t.after(async () => {
    await app.close();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  const post = (
    url: string,
    payload: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: "POST",
      url,
      headers: { origin, ...headers },
      payload,
    });
  const start = (email = "owner@example.test") =>
    post("/api/auth/register", {
      name: "Owner",
      email,
      password,
      confirmPassword: password,
      teamName: "Identity test",
    });
  const verify = (
    id: string,
    email = "owner@example.test",
    headers: Record<string, string> = {},
  ) =>
    post(
      "/api/auth/verify",
      { challengeId: id, code: box.code(email) },
      headers,
    );
  async function register(email = "owner@example.test") {
    const pending = await start(email);
    assert.equal(pending.statusCode, 202, pending.body);
    const checked = await verify(pending.json().challengeId, email);
    assert.equal(checked.statusCode, 200, checked.body);
    return {
      cookie: checked.cookies[0].name + "=" + checked.cookies[0].value,
      "x-csrf-token": checked.json().csrfToken,
    };
  }
  return { app, db, box, post, start, verify, register };
}

test("registration requires matching passwords and a real single-use email proof before creating any account or session", async (t) => {
  const { app, db, post, start, verify } = await setup(t);
  const bad = await post("/api/auth/register", {
    name: "Owner",
    email: "owner@example.test",
    password,
    confirmPassword: "different",
    teamName: "Team",
  });
  assert.equal(bad.statusCode, 400);
  const pending = await start();
  assert.equal(pending.statusCode, 202, pending.body);
  assert.equal(pending.cookies.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 0);
  assert.equal((await app.inject({ url: "/api/state" })).statusCode, 401);
  assert.equal(
    (await post("/api/auth/login", { email: "owner@example.test", password }))
      .statusCode,
    401,
  );
  const stored = db.prepare("SELECT * FROM auth_challenges").get()!;
  assert.ok(!String(stored.payload).includes(password));
  assert.match(String(stored.code_hash), /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await post(
        "/api/auth/verify",
        { challengeId: pending.json().challengeId, code: "000000" },
        { origin: "https://attacker.test" },
      )
    ).statusCode,
    403,
  );
  const verified = await verify(pending.json().challengeId);
  assert.equal(verified.statusCode, 200, verified.body);
  assert.ok(
    db.prepare("SELECT email_verified_at FROM users").get()!.email_verified_at,
  );
  assert.equal((await verify(pending.json().challengeId)).statusCode, 400);
  const wrong = await post("/api/auth/login", {
    email: "owner@example.test",
    password: "incorrect",
  });
  assert.equal(wrong.statusCode, 401);
  const login = await post("/api/auth/login", {
    email: "owner@example.test",
    password,
  });
  assert.equal(login.statusCode, 202);
  assert.equal(login.cookies.length, 0);
  assert.equal((await verify(login.json().challengeId)).statusCode, 200);
});

test("OTP guessing, expiry, resends and budgets are enforced across persistent challenges", async (t) => {
  const { db, box, post, start, verify } = await setup(t);
  const first = await start(),
    id = first.json().challengeId;
  assert.equal(
    (await post("/api/auth/resend", { challengeId: id })).statusCode,
    429,
  );
  const old = box.code("owner@example.test");
  db.prepare("UPDATE auth_challenges SET resend_at=0 WHERE id=?").run(id);
  assert.equal(
    (await post("/api/auth/resend", { challengeId: id })).statusCode,
    200,
  );
  const latest = box.code("owner@example.test");
  if (old !== latest)
    assert.equal(
      (await post("/api/auth/verify", { challengeId: id, code: old }))
        .statusCode,
      400,
    );
  assert.equal((await verify(id)).statusCode, 200);
  const second = await start("locked@example.test"),
    locked = second.json().challengeId,
    actual = box.code("locked@example.test"),
    wrong = actual === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await post("/api/auth/verify", { challengeId: locked, code: wrong }))
        .statusCode,
      400,
    );
  assert.equal((await verify(locked, "locked@example.test")).statusCode, 400);
  const third = await start("expired@example.test");
  db.prepare("UPDATE auth_challenges SET expires=0 WHERE id=?").run(
    third.json().challengeId,
  );
  assert.equal(
    (await verify(third.json().challengeId, "expired@example.test")).statusCode,
    400,
  );
  assert.equal(
    (await post("/api/auth/resend", { challengeId: third.json().challengeId }))
      .statusCode,
    400,
  );
});

test("a second signup cannot replace an existing account password or membership", async (t) => {
  const { post, start, verify, register, db } = await setup(t);
  await register();
  const user = db.prepare("SELECT * FROM users").get()!;
  const second = await start();
  assert.equal(second.statusCode, 202);
  assert.equal((await verify(second.json().challengeId)).statusCode, 409);
  assert.equal(
    db.prepare("SELECT password_hash FROM users").get()!.password_hash,
    user.password_hash,
  );
  assert.equal(
    (await post("/api/auth/login", { email: "owner@example.test", password }))
      .statusCode,
    202,
  );
});

test("password recovery is generic, single-use, revokes every session and pending login, and never signs in automatically", async (t) => {
  const { app, post, box, register, db } = await setup(t);
  const oldSession = await register();
  const login = await post("/api/auth/login", {
      email: "owner@example.test",
      password,
    }),
    loginCode = box.code("owner@example.test");
  const unknown = await post("/api/auth/forgot-password", {
      email: "unknown@example.test",
    }),
    known = await post("/api/auth/forgot-password", {
      email: "owner@example.test",
    });
  assert.equal(unknown.statusCode, 202);
  assert.equal(known.statusCode, 202);
  assert.equal(unknown.json().message, known.json().message);
  assert.equal(
    box.messages.some((message) => message.to === "unknown@example.test"),
    false,
  );
  const proof = {
    challengeId: known.json().challengeId,
    code: box.code("owner@example.test"),
    password: "A different reset passphrase!",
    confirmPassword: "A different reset passphrase!",
  };
  const reset = await post("/api/auth/reset-password", proof);
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal(reset.cookies.length, 0);
  assert.equal((await post("/api/auth/reset-password", proof)).statusCode, 400);
  assert.equal(
    (await app.inject({ url: "/api/state", headers: oldSession })).statusCode,
    401,
  );
  assert.equal(
    (
      await post("/api/auth/verify", {
        challengeId: login.json().challengeId,
        code: loginCode,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await post("/api/auth/login", { email: "owner@example.test", password }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await post("/api/auth/login", {
        email: "owner@example.test",
        password: proof.password,
      })
    ).statusCode,
    202,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n, 0);
  assert.ok(
    box.messages.some(
      (message) => message.subject === "Your Teamfare password was changed",
    ),
  );
});

test("password changes require a session, CSRF, current password, confirmation and email code, then revoke sessions", async (t) => {
  const { app, post, verify, register } = await setup(t),
    headers = await register();
  const data = {
    currentPassword: password,
    password: "An updated secret passphrase!",
    confirmPassword: "An updated secret passphrase!",
  };
  assert.equal((await post("/api/auth/change-password", data)).statusCode, 401);
  assert.equal(
    (await post("/api/auth/change-password", data, { cookie: headers.cookie }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await post(
        "/api/auth/change-password",
        { ...data, currentPassword: "wrong" },
        headers,
      )
    ).statusCode,
    401,
  );
  const change = await post("/api/auth/change-password", data, headers);
  assert.equal(change.statusCode, 202, change.body);
  assert.equal(
    (await app.inject({ url: "/api/state", headers })).statusCode,
    200,
  );
  assert.equal((await verify(change.json().challengeId)).statusCode, 401);
  const verified = await verify(
    change.json().challengeId,
    "owner@example.test",
    headers,
  );
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().passwordChanged, true);
  assert.equal(
    (await app.inject({ url: "/api/state", headers })).statusCode,
    401,
  );
  assert.equal(
    (
      await post("/api/auth/login", {
        email: "owner@example.test",
        password: data.password,
      })
    ).statusCode,
    202,
  );
});

test("mail failure never activates an account; missing setup fails closed; old unverified sessions are invalidated by migration", async (t) => {
  const failed = await setup(t, true);
  assert.equal((await failed.start()).statusCode, 503);
  assert.equal(
    failed.db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n,
    0,
  );
  const old = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };
  for (const key of Object.keys(old)) delete process.env[key];
  const unconfigured = await createApp({ databasePath: ":memory:", origin });
  try {
    assert.equal(
      (await unconfigured.inject({ url: "/api/auth/config" })).json().ready,
      false,
    );
    assert.equal(
      (
        await unconfigured.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { origin },
          payload: {
            name: "Owner",
            email: "owner@example.test",
            password,
            confirmPassword: password,
            teamName: "Team",
          },
        })
      ).statusCode,
      503,
    );
  } finally {
    await unconfigured.close();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "teamfare-migration-")),
    path = join(dir, "old.sqlite");
  const existing = new Store(path);
  existing.db.exec(
    "DROP TABLE auth_notifications; DROP TABLE auth_audit; DROP TABLE auth_challenges; DROP TABLE auth_limits; ALTER TABLE users DROP COLUMN email_verified_at; ALTER TABLE users DROP COLUMN auth_version; ALTER TABLE sessions DROP COLUMN last_seen; DELETE FROM schema_migrations WHERE version>=3;",
  );
  existing.db
    .prepare("INSERT INTO teams VALUES(?,?,?)")
    .run("team", "Old team", new Date().toISOString());
  existing.db
    .prepare(
      "INSERT INTO users(id,team_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)",
    )
    .run("old", "team", "Owner", "old@example.test", "unused-hash", "manager");
  existing.db
    .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
    .run("old-session", "old", "old-csrf", Date.now() + 100000);
  existing.close();
  const migrated = new Store(path);
  assert.equal(
    migrated.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n,
    0,
  );
  assert.equal(migrated.user("old")!.email_verified_at, null);
  migrated.close();
  await rm(dir, { recursive: true, force: true });
  const idle = await setup(t),
    headers = await idle.register();
  idle.db
    .prepare("UPDATE sessions SET last_seen=?")
    .run(Date.now() - 31 * 60000);
  assert.equal(
    (await idle.app.inject({ url: "/api/state", headers })).statusCode,
    401,
  );
});
