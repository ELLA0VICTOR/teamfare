import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function switchRole(page: Page, role: "manager" | "employee") {
  await page.getByRole("button", { name: "Account and demo role" }).click();
  await page.getByRole("button", { name: `Try the ${role} view` }).click();
}

test("create, approve, RSVP, and retain an outing after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore A little clay play" })
    .click();
  await page.getByRole("button", { name: "Make it our plan" }).click();
  await page.getByRole("button", { name: "Let’s do this" }).click();
  await page.getByLabel("Give it a name").fill("Product team clay afternoon");
  await page.getByLabel("How many people?").fill("6");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("dialog")).toContainText("Awaiting approval");
  await expect(
    page.getByRole("button", { name: "Give it the go-ahead" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await switchRole(page, "manager");
  await page.getByRole("button", { name: "Our plans" }).click();
  await page.getByRole("button", { name: "Needs attention" }).click();
  await page
    .getByRole("button", { name: "View Product team clay afternoon" })
    .click();
  await page.getByRole("button", { name: "Give it the go-ahead" }).click();
  await expect(page.getByRole("dialog").locator(".status-label")).toHaveText(
    "Approved",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await switchRole(page, "employee");
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await page
    .getByRole("button", { name: "View Product team clay afternoon" })
    .click();
  await page.getByRole("button", { name: "Change my RSVP" }).click();
  await expect(page.getByRole("button", { name: "Count me in" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Our plans" }).click();
  await page
    .getByRole("button", { name: "View Product team clay afternoon" })
    .click();
  await expect(page.getByRole("button", { name: "Count me in" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("over-budget plans can be saved and corrected before review", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an outing", exact: true })
    .click();
  await page.getByRole("button", { name: "Let’s do this" }).click();
  await page.getByLabel("Give it a name").fill("Budget correction");
  await page.getByLabel("Total budget (NGN)").fill("1000");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("alert")).toContainText("above your budget");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("dialog").locator(".status-label")).toHaveText(
    "Draft",
  );
  await expect(
    page.getByRole("button", { name: "Send for approval" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit the details" }).click();
  await page.getByLabel("Total budget (NGN)").fill("200000");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("dialog").locator(".status-label")).toHaveText(
    "Awaiting approval",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await switchRole(page, "manager");
  await page.getByRole("button", { name: "Our plans" }).click();
  await page.getByRole("button", { name: "Needs attention" }).click();
  await page.getByRole("button", { name: "View Budget correction" }).click();
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByRole("dialog").locator(".status-label")).toHaveText(
    "Changes requested",
  );
  await page.getByRole("button", { name: "Edit the details" }).click();
  await page.getByLabel("Give it a name").fill("Updated budget correction");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Updated budget correction",
  );
});

test("expenses persist, update totals, and export a safe, filtered CSV", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await page.getByRole("button", { name: "Add an expense" }).click();
  await page.getByLabel("What was it for?").fill("=Transport to lunch");
  await page.getByLabel("Amount (NGN)").fill("15000");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Transport");
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  await expect(page.locator(".expense-summary")).toContainText("75,000");
  await expect(page.getByRole("table")).toContainText("=Transport to lunch");
  await page
    .getByLabel("Filter expenses by outing")
    .selectOption("sample-lunch");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("'=Transport to lunch");
  expect(csv).toContain("15000");
  expect(csv).toContain("A proper team catch-up");
  expect(csv).not.toContain("Something a little hands-on");
  await page.reload();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("=Transport to lunch");
});

test("mobile filters, favourites, navigation, and accessible dialogs work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save A little clay play", exact: true })
    .click();
  await page.getByRole("button", { name: "Show saved experiences" }).click();
  await expect(page.locator(".experience-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Explore A little clay play" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore A little clay play" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Our plans" }).click();
  await expect(page.getByRole("heading", { name: "Our plans." })).toBeVisible();
  await page
    .getByRole("button", { name: "View A proper team catch-up" })
    .click();
  const dialogBox = await page.getByRole("dialog").boundingBox();
  expect(dialogBox!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("cancellation retains recorded expenses and removes the outing from upcoming", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Our plans" }).click();
  await page
    .getByRole("button", { name: "View A proper team catch-up" })
    .click();
  await page.getByRole("button", { name: "Cancel this outing" }).click();
  await page
    .getByRole("button", { name: "Cancel outing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View A proper team catch-up" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Past & cancelled" }).click();
  await expect(page.locator(".plan-row")).toContainText("Cancelled");
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Lunch deposit");
  await expect(
    page.locator(".expense-summary").getByText("₦0", { exact: true }),
  ).toBeVisible();
});
