import { verifiedAccount } from "../account-helpers";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const origin = "http://127.0.0.1:5180";

test("sourced research becomes an editable plan and survives manager review and reload", async ({
  browser,
}) => {
  const managerContext = await browser.newContext({ baseURL: origin }),
    employeeContext = await browser.newContext({ baseURL: origin });
  const suffix = crypto.randomUUID().slice(0, 8),
    password = "Agent-fixture-password!";
  const registered = await verifiedAccount(
    managerContext.request,
    "/api/auth/register",
    {
      name: "Mariam Cole",
      email: `research-manager-${suffix}@example.test`,
      password,
      teamName: "Research team",
    },
    origin,
    3004,
  );
  expect(registered.status()).toBe(200);
  const account = await registered.json();
  const invite = await managerContext.request.post("/api/invites", {
    headers: { origin, "x-csrf-token": account.csrfToken },
    data: { role: "employee" },
  });
  const joined = await verifiedAccount(
    employeeContext.request,
    "/api/auth/join",
    {
      name: "Tomi Ade",
      email: `research-employee-${suffix}@example.test`,
      password,
      inviteCode: (await invite.json()).code,
    },
    origin,
    3004,
  );
  expect(joined.status()).toBe(200);
  const employee = await employeeContext.newPage(),
    manager = await managerContext.newPage(),
    errors: string[] = [];
  for (const page of [employee, manager])
    page.on("pageerror", (error) => errors.push(error.message));
  await employee.goto("/");
  await employee
    .getByLabel("Describe the outing")
    .fill("A relaxed lunch for eight people in Lagos with vegan options.");
  await employee
    .getByRole("button", { name: "Research options", exact: true })
    .click();
  await expect(
    employee.getByRole("heading", { name: "Options worth considering" }),
  ).toBeVisible();
  await expect(employee.locator(".research-option")).toHaveCount(2);
  await expect(employee.locator(".research-option").first()).toContainText(
    "₦152,000",
  );
  await expect(employee.locator(".research-progress")).toContainText(
    "not live research",
  );
  await expect(
    employee
      .locator(".research-option")
      .first()
      .getByRole("link", { name: "Table House menus" }),
  ).toHaveAttribute("href", "https://venues.example.com/table-house");
  await mkdir(".artifacts/research", { recursive: true });
  await employee.evaluate(() => document.fonts.ready);
  await employee.screenshot({
    path: ".artifacts/research/options-desktop.png",
    fullPage: true,
  });
  await employee.setViewportSize({ width: 390, height: 844 });
  expect(
    await employee.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await employee.screenshot({
    path: ".artifacts/research/options-mobile.png",
    fullPage: true,
  });
  await employee
    .locator(".research-option")
    .first()
    .getByRole("button", { name: "Use this plan", exact: true })
    .click();
  await expect(
    employee.getByRole("heading", {
      name: "Lunch at Table House",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    employee.getByRole("heading", { name: "Research and sources" }),
  ).toBeVisible();
  await expect(employee.locator(".price-quotes")).toContainText("NGN18,000");
  await employee
    .locator(".proposal-cost-edit")
    .first()
    .getByLabel("Amount (NGN)")
    .fill("17000");
  await employee.getByLabel("People", { exact: true }).fill("6");
  await expect(employee.locator(".cost-ledger .ledger-total")).toContainText(
    "₦110,000",
  );
  await employee
    .getByLabel("Step 2 details")
    .fill("Choose the meal after confirming vegan preparation with the venue.");
  await employee
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(employee.locator(".price-quotes")).toHaveCount(0);
  await employee.reload();
  await expect(employee.locator(".cost-ledger .ledger-total")).toContainText(
    "₦110,000",
  );
  await expect(employee.getByLabel("Step 2 details")).toHaveValue(
    "Choose the meal after confirming vegan preparation with the venue.",
  );
  await employee.screenshot({
    path: ".artifacts/research/draft-mobile.png",
    fullPage: true,
  });
  await employee
    .getByRole("button", { name: "Send to Mariam Cole for approval" })
    .click();
  await expect(employee.locator(".sheet-kicker")).toContainText(
    "Awaiting approval",
  );
  await manager.goto("/" + new URL(employee.url()).hash);
  await expect(
    manager.getByRole("heading", { name: "For your approval" }),
  ).toBeVisible();
  await expect(manager.locator(".cost-ledger .ledger-total")).toContainText(
    "₦110,000",
  );
  await manager.screenshot({
    path: ".artifacts/research/manager-review.png",
    fullPage: true,
  });
  await manager.getByRole("link", { name: "Original research" }).click();
  await expect(
    manager.getByRole("heading", { name: "Options worth considering" }),
  ).toBeVisible();
  await expect(
    manager.getByRole("button", { name: "Use this plan", exact: true }),
  ).toHaveCount(0);
  await manager.getByRole("link", { name: "Open your draft" }).click();
  await manager.getByRole("button", { name: "Approve", exact: true }).click();
  await employee.reload();
  await expect(employee.locator(".sheet-kicker")).toContainText("Approved");
  expect(errors).toEqual([]);
  await managerContext.close();
  await employeeContext.close();
});
