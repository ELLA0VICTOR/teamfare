import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { verifiedAccount } from "../account-helpers";
import { referenceQuote, sourceAmount } from "../../src/currency";
test("USD organiser and NGN manager share unchanged native amounts, approve and export USD", async ({
  browser,
}) => {
  const origin = "http://127.0.0.1:5178",
    password = "Currency workflow passphrase 2026!",
    suffix = crypto.randomUUID().slice(0, 8);
  const managerContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    }),
    employeeContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 390, height: 844 },
    });
  try {
    await managerContext.addInitScript(() =>
      localStorage.setItem("teamfare-display-currency-v1", "NGN"),
    );
    const registered = await verifiedAccount(
      managerContext.request,
      "/api/auth/register",
      {
        name: "Currency Manager",
        email: `currency-manager-${suffix}@example.test`,
        password,
        teamName: "Currency team",
      },
      origin,
      3002,
    );
    const owner = await registered.json();
    const invited = await managerContext.request.post("/api/invites", {
      headers: { origin, "X-CSRF-Token": owner.csrfToken },
      data: { role: "employee" },
    });
    const joined = await verifiedAccount(
      employeeContext.request,
      "/api/auth/join",
      {
        name: "Currency Organiser",
        email: `currency-employee-${suffix}@example.test`,
        password,
        inviteCode: (await invited.json()).code,
      },
      origin,
      3002,
    );
    await joined.json();
    const employee = await employeeContext.newPage(),
      manager = await managerContext.newPage();
    await employee.goto("/");
    await expect(employee.getByLabel("Display currency")).toHaveValue("USD");
    await employee
      .getByLabel("Describe the outing")
      .fill("USD cross-account lunch");
    await employee.getByRole("button", { name: /Add details/ }).click();
    await employee.getByLabel("People", { exact: true }).fill("4");
    await employee.getByLabel("Budget per person (USD)").fill("30.00");
    await employee
      .getByRole("button", { name: "Start a plan", exact: true })
      .click();
    await expect(employee).toHaveURL(/#plan\//);
    const planId = new URL(employee.url()).hash.slice("#plan/".length),
      budget = sourceAmount(30, "USD", referenceQuote) * 4;
    await expect(employee.getByLabel("Total budget (USD)")).toHaveValue(
      "120.00",
    );
    await employee
      .getByRole("button", { name: /Send to .* for approval/ })
      .click();
    await manager.goto("/#plan/" + planId);
    await expect(manager.getByLabel("Display currency")).toHaveValue("NGN");
    await expect(manager.locator(".review-strip")).toContainText(
      budget.toLocaleString("en-NG"),
    );
    await manager.getByRole("button", { name: "Approve", exact: true }).click();
    await employee.reload();
    await employee.getByRole("button", { name: "Going", exact: true }).click();
    await employee
      .getByRole("button", { name: "Add expense", exact: true })
      .first()
      .click();
    await employee
      .getByLabel("Description", { exact: true })
      .fill("USD receipt entry");
    await employee.getByLabel("Amount (USD)").fill("8.25");
    await employee
      .getByRole("button", { name: "Record expense", exact: true })
      .click();
    await expect(employee.getByRole("dialog")).toHaveCount(0);
    const before = await (
      await managerContext.request.get("/api/state")
    ).json();
    expect(
      before.state.plans.find((p: { id: string }) => p.id === planId).budget,
    ).toBe(budget);
    expect(
      before.state.expenses.find(
        (e: { description: string }) => e.description === "USD receipt entry",
      ).amount,
    ).toBe(sourceAmount(8.25, "USD", referenceQuote));
    await employee.goto("/#expenses");
    const downloading = employee.waitForEvent("download");
    await employee
      .getByRole("button", { name: "Export CSV", exact: true })
      .click();
    const csv = await readFile((await (await downloading).path())!, "utf8");
    expect(csv).toContain("Amount (USD)");
    expect(csv).toContain('"8.25"');
    await manager.getByLabel("Display currency").selectOption("USD");
    await expect(manager.locator(".rail-total")).toHaveText("$54.96");
    const after = await (await managerContext.request.get("/api/state")).json();
    expect(after.state.plans).toEqual(before.state.plans);
    expect(after.state.expenses).toEqual(before.state.expenses);
    await mkdir(".artifacts/currency", { recursive: true });
    await employee.screenshot({
      path: ".artifacts/currency/usd-mobile-expenses.png",
      fullPage: true,
    });
    await manager.screenshot({
      path: ".artifacts/currency/usd-desktop-plan.png",
      fullPage: true,
    });
  } finally {
    await managerContext.close();
    await employeeContext.close();
  }
});
