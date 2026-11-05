import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../store.ts";
import { seedJudges, judgeAccounts, judgeTeamId } from "../seed-judges.ts";
import { createApp, verifiedAccount } from "./helpers.ts";

test("judge credentials grant only the seeded team, preserve normal OTP and cannot change shared access", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "teamfare-judges-")),
    databasePath = join(folder, "team.sqlite"),
    store = new Store(databasePath);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  t.after(async () => {
    await app?.close();
    store.close();
    await rm(folder, { recursive: true, force: true });
  });
  await seedJudges(store);
  const hash = store.user(judgeAccounts[0].id)!.password_hash;
  store.db
    .prepare(
      "UPDATE plans SET data=json_set(data,'$.note',?) WHERE id='judge-clay-v1'",
    )
    .run("Preserve judge work");
  await seedJudges(store);
  assert.equal(store.user(judgeAccounts[0].id)!.password_hash, hash);
  assert.equal(
    JSON.parse(store.plan("judge-clay-v1", judgeTeamId)!.data).note,
    "Preserve judge work",
  );
  app = await createApp({ databasePath, authLimit: 100 });
  const running = app;
  const origin = "http://localhost:5173";
  const post = (
    url: string,
    payload: object,
    headers: Record<string, string> = {},
  ) =>
    running.inject({
      method: "POST",
      url,
      headers: { origin, ...headers },
      payload,
    });
  for (const account of judgeAccounts) {
    const login = await post("/api/auth/login", {
      email: account.email,
      password: account.password,
    });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().user.judge, true);
    assert.equal(login.json().team.id, judgeTeamId);
    assert.equal(login.json().user.role, account.role);
    const headers = {
      cookie: login.cookies[0].name + "=" + login.cookies[0].value,
      "x-csrf-token": login.json().csrfToken,
    };
    assert.equal(
      (
        await post(
          "/api/auth/change-password",
          {
            currentPassword: account.password,
            password: "Different password 2026!",
            confirmPassword: "Different password 2026!",
          },
          headers,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await post("/api/auth/logout-all", {}, headers)).statusCode,
      403,
    );
    assert.equal(
      (await post("/api/invites", { role: "employee" }, headers)).statusCode,
      403,
    );
    assert.equal((await post("/api/auth/logout", {}, headers)).statusCode, 200);
    const forgot = await post("/api/auth/forgot-password", {
      email: account.email,
    });
    assert.equal(forgot.statusCode, 202);
    assert.equal(
      store.db
        .prepare("SELECT user_id FROM auth_challenges WHERE id=?")
        .get(forgot.json().challengeId)?.user_id,
      null,
    );
  }
  assert.equal(
    (
      await post("/api/auth/login", {
        email: judgeAccounts[0].email,
        password: "wrong",
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await post("/api/auth/login", {
        email: judgeAccounts[0].email,
        password: judgeAccounts[0].password,
        judge: true,
      })
    ).statusCode,
    400,
  );
  const real = {
    name: "Real owner",
    email: "real@example.test",
    password: "Real member password 2026!",
    teamName: "Private real team",
  };
  const registered = await verifiedAccount(
    app,
    "/api/auth/register",
    origin,
    real,
  );
  assert.equal(registered.json().user.judge, false);
  assert.equal(registered.json().state.plans.length, 0);
  const pending = await post("/api/auth/login", {
    email: real.email,
    password: real.password,
  });
  assert.equal(pending.statusCode, 202);
  assert.equal(pending.cookies.length, 0);
  const cookie = registered.cookies[0].name + "=" + registered.cookies[0].value;
  const denied = await app.inject({
    method: "POST",
    url: "/api/plans/judge-clay-v1/action",
    headers: { origin, cookie, "x-csrf-token": registered.json().csrfToken },
    payload: { action: "approve", revision: 1 },
  });
  assert.equal(denied.statusCode, 404);
  assert.equal(
    (
      await post("/api/auth/register", {
        ...real,
        email: judgeAccounts[0].email,
        confirmPassword: real.password,
      })
    ).statusCode,
    400,
  );
});
