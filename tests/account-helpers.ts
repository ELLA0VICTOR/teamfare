import { expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
export async function fixtureCode(
  _request: APIRequestContext,
  email: string,
  apiPort: number,
  challengeId?: string,
) {
  const file =
    apiPort === 3004
      ? ".artifacts/agent-mailbox.json"
      : ".artifacts/live-mailbox.json";
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        try {
          const messages = JSON.parse(await readFile(file, "utf8")) as {
            to: string;
            text: string;
          }[];
          code = messages
            .findLast(
              (message) =>
                message.to === email &&
                message.text.includes("Your Teamfare code") &&
                (!challengeId ||
                  ("id" in message &&
                    String(message.id).startsWith(`auth/${challengeId}/`))),
            )
            ?.text.match(/is (\d{6})\./)?.[1];
          return !!code;
        } catch {
          return false;
        }
      },
      { timeout: 5000 },
    )
    .toBe(true);
  return code!;
}
export async function verifyEmail(page: Page, email: string, apiPort = 3002) {
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(await fixtureCode(page.request, email, apiPort));
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
}
export async function verifiedAccount(
  request: APIRequestContext,
  route: string,
  data: Record<string, unknown>,
  origin: string,
  apiPort: number,
) {
  const pending = await request.post(route, {
    headers: { origin },
    data: {
      ...data,
      ...(route.endsWith("login") ? {} : { confirmPassword: data.password }),
    },
  });
  expect(pending.status()).toBe(202);
  return request.post("/api/auth/verify", {
    headers: { origin },
    data: {
      challengeId: (await pending.json()).challengeId,
      code: await fixtureCode(request, String(data.email), apiPort),
    },
  });
}
