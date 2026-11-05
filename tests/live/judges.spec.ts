import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { judgeAccounts } from "../../server/seed-judges.ts";

test("judges sign in without OTP, use role boundaries and export an inclusive date-range report", async ({
  browser,
}) => {
  const managerContext = await browser.newContext(),
    organiserContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  const manager = await managerContext.newPage(),
    organiser = await organiserContext.newPage();
  try {
    for (const [page, account] of [
      [manager, judgeAccounts[0]],
      [organiser, judgeAccounts[1]],
    ] as const) {
      await page.goto("http://127.0.0.1:5178");
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(account.password);
      await page
        .getByRole("button", { name: "Sign in", exact: true })
        .last()
        .click();
      await expect(page.locator(".judge-notice")).toContainText(
        "Shared judge team",
      );
      await expect(
        page.getByLabel("Verification code", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Account security", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Invite teammate", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Account", exact: true }).click();
    }
    await manager.goto("http://127.0.0.1:5178/#expenses");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await manager.getByLabel("From date", { exact: true }).fill(today);
    await manager.getByLabel("To date", { exact: true }).fill(today);
    await expect(manager.getByRole("table")).toContainText(
      "Sample lunch deposit",
    );
    await expect(manager.locator(".expense-group")).toHaveCount(1);
    const downloading = manager.waitForEvent("download");
    await manager.getByRole("button", { name: "Export CSV" }).click();
    const csv = await readFile((await (await downloading).path())!, "utf8");
    expect(csv).toContain("Sample lunch deposit");
    expect(csv).not.toContain("Sample previous meal");
    await manager.getByLabel("From date", { exact: true }).fill("2099-01-01");
    await expect(manager.getByRole("alert")).toContainText("end date");
    await expect(
      manager.getByRole("button", { name: "Export CSV" }),
    ).toBeDisabled();
    await manager
      .getByRole("button", { name: "Clear expense filters" })
      .click();
    await expect(manager.locator(".expense-group")).toHaveCount(2);
    await organiser.goto("http://127.0.0.1:5178/#expenses");
    expect(
      await organiser.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  } finally {
    await managerContext.close();
    await organiserContext.close();
  }
});
