import assert from "node:assert/strict";
import { createApp as actualApp } from "../app.ts";
import { testMailbox } from "./fixtures/mail.ts";
type App = Awaited<ReturnType<typeof actualApp>>;
const boxes = new WeakMap<App, ReturnType<typeof testMailbox>>();
export async function createApp(options: Parameters<typeof actualApp>[0] = {}) {
  const box = testMailbox();
  const app = await actualApp({
    ...options,
    mailer: box.mailer,
    authSecret: "test-only-secret-with-at-least-32-characters",
  });
  boxes.set(app, box);
  return app;
}
export async function verifiedAccount(
  app: App,
  route: string,
  origin: string,
  data: Record<string, unknown>,
) {
  const started = await app.inject({
    method: "POST",
    url: route,
    headers: { origin },
    payload: {
      ...data,
      ...(route.endsWith("login") ? {} : { confirmPassword: data.password }),
    },
  });
  assert.equal(started.statusCode, 202, started.body);
  const code = boxes.get(app)!.code(String(data.email));
  const checked = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    headers: { origin },
    payload: { challengeId: started.json().challengeId, code },
  });
  assert.equal(checked.statusCode, 200, checked.body);
  return checked;
}
