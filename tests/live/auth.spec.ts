import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixtureCode, verifiedAccount, verifyEmail } from "../account-helpers";

test("email verification, password change, recovery and session revocation work through the interface", async ({
  browser,
}) => {
  const origin = "http://127.0.0.1:5178",
    email = `security-${crypto.randomUUID().slice(0, 8)}@example.test`,
    password = "Initial security passphrase!",
    changed = "Changed security passphrase!",
    recovered = "Recovered security passphrase!";
  const seed = await browser.newContext({ baseURL: origin });
  const registered = await verifiedAccount(
    seed.request,
    "/api/auth/register",
    { name: "Security Test", email, password, teamName: "Security team" },
    origin,
    3002,
  );
  expect(registered.status()).toBe(200);
  const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  expect((await context.request.get("/api/session")).ok()).toBe(true);
  expect(
    (await (await context.request.get("/api/session")).json()).user,
  ).toBeNull();
  const actual = await fixtureCode(page.request, email, 3002);
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(actual === "000000" ? "000001" : "000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid");
  await page.reload();
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain(password);
  await mkdir(".artifacts/auth", { recursive: true });
  await page.screenshot({
    path: ".artifacts/auth/login-code-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: ".artifacts/auth/login-code-mobile.png",
    fullPage: true,
  });
  await verifyEmail(page, email);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("button", { name: "Account security", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password", { exact: true }).fill(changed);
  await page.getByRole("button", { name: "Send confirmation code" }).click();
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await seed.request.get("/api/session")).json()).user,
  ).toBeTruthy();
  await page.screenshot({
    path: ".artifacts/auth/password-change-mobile.png",
    fullPage: true,
  });
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(await fixtureCode(page.request, email, 3002));
  await page.getByRole("button", { name: "Confirm password change" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    (await (await seed.request.get("/api/session")).json()).user,
  ).toBeNull();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset code" }).click();
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toBeVisible();
  const resetId = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("teamfare-auth-challenge")!)
        .challengeId as string,
  );
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(await fixtureCode(page.request, email, 3002, resetId));
  await page.getByLabel("New password", { exact: true }).fill(recovered);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("These do not match yet!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(recovered);
  await page.screenshot({
    path: ".artifacts/auth/reset-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "password has been reset",
  );
  expect(
    (await (await context.request.get("/api/session")).json()).user,
  ).toBeNull();
  const old = await context.request.post("/api/auth/login", {
    headers: { origin },
    data: { email, password: changed },
  });
  expect(old.status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(recovered);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await verifyEmail(page, email);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("button", { name: "Account security", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
  await seed.close();
});
