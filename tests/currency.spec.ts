import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { displayAmount, sourceAmount, referenceQuote } from "../src/currency";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("teamfare-mode", "preview"),
  );
});
test("USD is the default and switching currencies never rewrites stored records", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Display currency")).toHaveValue("USD");
  const input = page.getByLabel("Budget per person (USD)");
  await expect(input).toHaveValue(
    displayAmount(25000, "USD", referenceQuote).toFixed(2),
  );
  const before = await page.evaluate(() =>
    localStorage.getItem("teamfare-preview-v1"),
  );
  await page.getByLabel("Display currency").selectOption("NGN");
  await expect(page.getByLabel("Budget per person (₦)")).toHaveValue("25,000");
  await page.getByLabel("Display currency").selectOption("USD");
  expect(
    await page.evaluate(() => localStorage.getItem("teamfare-preview-v1")),
  ).toBe(before);
  await page.reload();
  await expect(page.getByLabel("Display currency")).toHaveValue("USD");
  await page.getByLabel("Display currency").selectOption("NGN");
  await page.reload();
  await expect(page.getByLabel("Display currency")).toHaveValue("NGN");
});
test("USD budget and expense entries convert once and export auditable USD CSV", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Describe the outing").fill("A dollar budget");
  await page.getByLabel("People", { exact: true }).fill("4");
  await page.getByLabel("Budget per person (USD)").fill("25.50");
  await page.getByRole("button", { name: "Start a plan", exact: true }).click();
  const expected = sourceAmount(25.5, "USD", referenceQuote) * 4;
  await expect(page.getByLabel("Total budget (USD)")).toHaveValue(
    displayAmount(expected, "USD", referenceQuote).toFixed(2),
  );
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("teamfare-preview-v1")!),
  );
  expect(records.plans.at(-1).budget).toBe(expected);
  await page.goto("/#expenses");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Description", { exact: true }).fill("USD entry");
  await page.getByLabel("Amount (USD)").fill("8.25");
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("teamfare-preview-v1")!),
  );
  expect(state.expenses.at(-1).amount).toBe(
    sourceAmount(8.25, "USD", referenceQuote),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await download;
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain("Amount (USD)");
  expect(csv).toContain("Original amount (NGN)");
  expect(csv).toContain(referenceQuote.updatedAt);
  expect(csv).toContain('"8.25"');
});
test("USD controls remain usable at 390px and currency changes retain in-progress budgets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Add details/ }).click();
  await page.getByLabel("Budget per person (USD)").fill("22.28");
  await page.getByLabel("Display currency").selectOption("NGN");
  await expect(page.getByLabel("Budget per person (₦)")).toHaveValue(
    sourceAmount(22.28, "USD", referenceQuote).toLocaleString("en-NG"),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
