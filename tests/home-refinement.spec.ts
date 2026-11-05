import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  // Preserve the existing NGN-specific journey; USD has separate coverage.
  await page.addInitScript(() => {
    sessionStorage.setItem("teamfare-mode", "preview");
    localStorage.setItem("teamfare-display-currency-v1", "NGN");
  });
});

test("Next up prioritises action, links to Needs you, and falls back without an empty state", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.getByRole("complementary", {
    name: "Next up",
    exact: true,
  });
  await expect(panel).toContainText("Your RSVP is open");
  await expect(
    panel.getByRole("link", { name: "RSVP", exact: true }),
  ).toBeVisible();
  const budget = page.getByLabel("Budget per person (₦)");
  await expect(budget).toHaveValue("25,000");
  await budget.fill("30000");
  await expect(budget).toHaveValue("30,000");

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("teamfare-preview-v1")!);
    data.plans[0].going.push("akin");
    data.plans[1].status = "Draft";
    data.plans.push({
      ...data.plans[1],
      id: "second-draft",
      title: "A second draft",
      date: "2099-01-01",
    });
    localStorage.setItem("teamfare-preview-v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(panel.getByRole("heading")).toHaveText(
    "Something a little hands-on",
  );
  await expect(panel.getByRole("link", { name: "Update plan" })).toBeVisible();
  await page.goto("/#plans");
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await page.goto("/#home");
  await panel.getByRole("link", { name: "1 more needs you" }).click();
  await expect(
    page.getByRole("button", { name: /^Needs you/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".plan-row")).toHaveCount(2);

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("teamfare-preview-v1")!);
    data.plans = [data.plans[0]];
    localStorage.setItem("teamfare-preview-v1", JSON.stringify(data));
  });
  await page.goto("/#home");
  await page.reload();
  await expect(panel).toContainText("Approved");
  await expect(
    panel.getByRole("link", { name: "View plan", exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".needs-action")).toHaveCount(0);

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("teamfare-preview-v1")!);
    data.plans = [];
    data.expenses = [];
    localStorage.setItem("teamfare-preview-v1", JSON.stringify(data));
  });
  await page.reload();
  const featured = page.getByRole("complementary", {
    name: "A place to start",
    exact: true,
  });
  await expect(featured.getByRole("heading")).toHaveText("The long lunch");
  await featured
    .getByRole("button", { name: "Plan this", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Experience", exact: true }),
  ).toHaveValue("long-table");
});

test("manager Next up shows the proposal and financial views reconcile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Account and demo role" }).click();
  await page.getByRole("button", { name: "Try the manager view" }).click();
  const panel = page.getByRole("complementary", {
    name: "Next up",
    exact: true,
  });
  await expect(panel.getByRole("heading")).toHaveText(
    "Something a little hands-on",
  );
  await expect(panel.locator("img")).toHaveAttribute(
    "src",
    "/images/pottery.jpg",
  );
  await panel
    .getByRole("link", { name: "Review and approve", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "For your approval" }),
  ).toBeVisible();

  await page.goto("/#plan/sample-lunch");
  await expect(page.locator(".cost-ledger .ledger-total")).toContainText(
    "₦148,000",
  );
  await expect(page.locator(".cost-ledger")).toContainText(
    "₦18,500 per person × 8",
  );
  await expect(page.locator(".cost-ledger")).toContainText("₦180,000");
  await page.goto("/#expenses");
  await expect(page.locator(".group-estimate")).toContainText(
    "Estimate ₦148,000 total",
  );
  await expect(page.locator(".group-spend")).toContainText(
    "Recorded ₦60,000 total / Budget ₦180,000 total",
  );
  const select = page.getByRole("combobox", {
    name: "Filter expenses by outing",
  });
  expect(await select.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    "15px",
  );
  expect((await select.boundingBox())!.height).toBe(44);
  const chevron = await page.locator(".select-chevron").boundingBox();
  expect(chevron!.width).toBe(12);
  expect(chevron!.height).toBe(12);
  expect(
    await page
      .locator(".expense-table th, .expense-table td")
      .evaluateAll((elements) =>
        Math.min(
          ...elements.map((el) => parseFloat(getComputedStyle(el).fontSize)),
        ),
      ),
  ).toBeGreaterThanOrEqual(13);
});
