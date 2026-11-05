import { verifyEmail } from "../account-helpers";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

async function accountMenu(page: Page, action: string) {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: action, exact: true }).click();
}
test("two actual accounts share an outing, enforce review, RSVP, record spending, and sign in again", async ({
  browser,
}) => {
  const managerContext = await browser.newContext(),
    employeeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  // These existing assertions exercise the retained NGN entry mode.
  await Promise.all(
    [managerContext, employeeContext].map((context) =>
      context.addInitScript(() =>
        localStorage.setItem("teamfare-display-currency-v1", "NGN"),
      ),
    ),
  );
  const manager = await managerContext.newPage(),
    employee = await employeeContext.newPage();
  const errors: string[] = [];
  for (const page of [manager, employee])
    page.on("pageerror", (error) => errors.push(error.message));
  const suffix = crypto.randomUUID().slice(0, 8),
    password = "Testing-Teamfare-2026!";
  const managerEmail = `manager-${suffix}@example.test`,
    employeeEmail = `employee-${suffix}@example.test`;
  await manager.goto("/");
  await expect(
    manager.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await mkdir(".artifacts/accounts", { recursive: true });
  await manager.evaluate(() => document.fonts.ready);
  await manager.screenshot({
    path: ".artifacts/accounts/sign-in-desktop.png",
    fullPage: true,
  });
  await manager
    .getByRole("button", { name: "Create a team", exact: true })
    .click();
  await manager.getByLabel("Your name").fill("Mariam Cole");
  await manager.getByLabel("Team name").fill("Shared design team");
  await manager.getByLabel("Email", { exact: true }).fill(managerEmail);
  await manager.getByLabel("Password", { exact: true }).fill(password);
  await manager.getByLabel("Confirm password", { exact: true }).fill(password);
  await manager
    .getByRole("button", { name: "Create team", exact: true })
    .click();
  await verifyEmail(manager, managerEmail);
  await expect(
    manager.getByRole("heading", { name: "Bring your team together." }),
  ).toBeVisible();
  await accountMenu(manager, "Invite teammate");
  await manager.getByRole("button", { name: "Create invitation code" }).click();
  const code = await manager.getByLabel("Invitation code").inputValue();
  await manager.getByRole("button", { name: "Close dialog" }).click();

  await employee.goto("/");
  await expect(
    employee.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await employee.evaluate(() => document.fonts.ready);
  await employee.screenshot({
    path: ".artifacts/accounts/sign-in-mobile.png",
    fullPage: true,
  });
  await employee
    .getByRole("button", { name: "Join a team", exact: true })
    .click();
  await employee.getByLabel("Your name").fill("Tomi Ade");
  await employee.getByLabel("Invitation code").fill(code);
  await employee.getByLabel("Email", { exact: true }).fill(employeeEmail);
  await employee.getByLabel("Password", { exact: true }).fill(password);
  await employee.getByLabel("Confirm password", { exact: true }).fill(password);
  await employee
    .getByRole("button", { name: "Join team", exact: true })
    .click();
  await verifyEmail(employee, employeeEmail);
  await employee
    .getByRole("button", { name: "Start a plan", exact: true })
    .click();
  await employee
    .getByLabel("Outing name", { exact: true })
    .fill("Our real shared lunch");
  await employee.screenshot({
    path: ".artifacts/accounts/live-draft-mobile.png",
    fullPage: true,
  });
  await employee
    .getByRole("button", { name: "Send to Mariam Cole for approval" })
    .click();
  await expect(employee.locator(".sheet-kicker")).toContainText(
    "Awaiting approval",
  );
  await expect(
    employee.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  const planRoute = new URL(employee.url()).hash;
  await manager.goto("/" + planRoute);
  await expect(
    manager.getByRole("heading", { name: "For your approval" }),
  ).toBeVisible();
  await manager.screenshot({
    path: ".artifacts/accounts/live-manager-review.png",
    fullPage: true,
  });
  await manager
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await manager
    .getByLabel("What needs to change?")
    .fill("Please move lunch to 14:00.");
  await manager.getByRole("button", { name: "Send back with note" }).click();
  await expect(manager.locator(".sheet-kicker")).toContainText(
    "Changes requested",
  );
  await employee.reload();
  await expect(employee.locator(".pinned-note")).toContainText(
    "Please move lunch to 14:00.",
  );
  await employee.getByLabel("Time", { exact: true }).fill("14:00");
  await employee
    .getByRole("button", { name: "Send to Mariam Cole for approval" })
    .click();
  await manager.reload();
  await manager.getByRole("button", { name: "Approve", exact: true }).click();
  await employee.reload();
  await employee.getByRole("button", { name: "Going", exact: true }).click();
  await expect(
    employee.getByRole("button", { name: "Going", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await employee
    .locator(".summary-rail")
    .getByRole("button", { name: "Add expense" })
    .click();
  await employee
    .getByLabel("Description", { exact: true })
    .fill("=Shared lunch deposit");
  await employee.getByLabel("Amount (NGN)").fill("60000");
  await employee
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  await manager.goto("/#expenses");
  await manager.reload();
  await expect(manager.getByRole("table")).toContainText(
    "=Shared lunch deposit",
  );
  await expect(manager.getByRole("table")).toContainText("Tomi Ade");
  await manager.screenshot({
    path: ".artifacts/accounts/live-expenses.png",
    fullPage: true,
  });
  const downloaded = manager.waitForEvent("download");
  await manager.getByRole("button", { name: "Export CSV" }).click();
  const csv = await readFile((await (await downloaded).path())!, "utf8");
  expect(csv).toContain("'=Shared lunch deposit");
  await accountMenu(employee, "Sign out");
  await expect(
    employee.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await employee.getByLabel("Email", { exact: true }).fill(employeeEmail);
  await employee.getByLabel("Password", { exact: true }).fill(password);
  await employee
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await verifyEmail(employee, employeeEmail);
  await expect(
    employee.getByRole("button", { name: "Account", exact: true }),
  ).toBeVisible();
  await employee.goto("/" + planRoute);
  await expect(
    employee.getByRole("heading", {
      name: "Our real shared lunch",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    employee.getByRole("button", { name: "Going", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await employee.evaluate(() => localStorage.getItem("teamfare-preview-v1")),
  ).toBeNull();
  expect(errors).toEqual([]);
  await managerContext.close();
  await employeeContext.close();
});
