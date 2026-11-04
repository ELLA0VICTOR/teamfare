import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("teamfare-mode", "preview"),
  );
});

async function switchRole(page: Page, role: "manager" | "employee") {
  await page.getByRole("button", { name: "Account and demo role" }).click();
  await page.getByRole("button", { name: `Try the ${role} view` }).click();
}
async function navigate(page: Page, name: "Home" | "Plans" | "Expenses") {
  const nav =
    page.viewportSize()!.width <= 600 ? "Mobile navigation" : "Main navigation";
  await page
    .getByRole("navigation", { name: nav, exact: true })
    .getByRole("link", { name, exact: true })
    .click();
}
async function start(page: Page, title: string) {
  await page.getByRole("button", { name: "Start a plan", exact: true }).click();
  await page.getByLabel("Outing name", { exact: true }).fill(title);
}
const send = (page: Page) =>
  page.getByRole("button", { name: "Send to Nadia for approval" }).click();

test("create, approve, RSVP, and retain an outing after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore A little clay play" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start a plan" })
    .click();
  await page
    .getByLabel("Outing name", { exact: true })
    .fill("Product team clay afternoon");
  await page.getByLabel("People", { exact: true }).fill("6");
  await send(page);
  await expect(page.locator(".sheet-kicker .status-text")).toHaveText(
    "Awaiting approval",
  );
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await switchRole(page, "manager");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".sheet-kicker .status-text")).toHaveText(
    "Approved",
  );
  await expect(page.locator(".activity-list")).toContainText(
    "No invitations were sent",
  );
  await switchRole(page, "employee");
  await page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Going", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Can’t make it", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Can’t make it", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Product team clay afternoon",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Can’t make it", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("over-budget drafts can be corrected; manager notes are required, pinned, and retained", async ({
  page,
}) => {
  await page.goto("/");
  await start(page, "Budget correction");
  await page.getByLabel("Total budget (NGN)").fill("1000");
  await expect(
    page.getByRole("button", { name: "Send to Nadia for approval" }),
  ).toBeDisabled();
  await expect(page.locator(".summary-rail")).toContainText(
    "above your budget",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Total budget (NGN)")).toHaveValue("1000");
  await page.getByLabel("Total budget (NGN)").fill("200000");
  await send(page);
  await switchRole(page, "manager");
  await page
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await page.getByLabel("What needs to change?").fill("   ");
  await page.getByRole("button", { name: "Send back with note" }).click();
  await expect(page.getByRole("alert")).toContainText("Add a note");
  await page
    .getByLabel("What needs to change?")
    .fill("Please move lunch to 14:00 and clarify transport.");
  await page.getByRole("button", { name: "Send back with note" }).click();
  await expect(page.locator(".sheet-kicker .status-text")).toHaveText(
    "Changes requested",
  );
  await expect(page.locator(".pinned-note")).toContainText("clarify transport");
  await expect(page.getByLabel("Outing name", { exact: true })).toHaveCount(0);
  await switchRole(page, "employee");
  await page.getByLabel("Time", { exact: true }).fill("14:00");
  await page
    .getByLabel("Note for the team")
    .fill("Transport is within our remaining budget.");
  await send(page);
  await expect(page.locator(".sheet-kicker .status-text")).toHaveText(
    "Awaiting approval",
  );
  await page.reload();
  await expect(page.locator(".pinned-note")).toContainText("clarify transport");
  await expect(page.locator(".activity-list")).toContainText(
    "Nadia requested changes",
  );
});

test("expenses persist, update totals, and export a safe, filtered CSV", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Expenses");
  await page
    .getByRole("button", { name: "Add expense", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("=Transport to lunch");
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
  expect(csv).toContain(
    'Date","Outing","Description","Category","Paid by","Amount (NGN)',
  );
  expect(csv).toContain("'=Transport to lunch");
  expect(csv).toContain("15000");
  expect(csv).toContain("A proper team catch-up");
  expect(csv).not.toContain("Something a little hands-on");
  await page.reload();
  await expect(page.getByRole("table")).toContainText("=Transport to lunch");
});

test("mobile filters, favourites, navigation, and accessible drawers work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save A little clay play", exact: true })
    .click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(".experience-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Explore A little clay play" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore A little clay play" }),
  ).toBeFocused();
  await navigate(page, "Plans");
  await expect(
    page.getByRole("heading", { name: "Plans", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View A proper team catch-up" }).click();
  await page.getByRole("button", { name: "Going", exact: true }).click();
  await page
    .locator(".summary-rail")
    .getByRole("button", { name: "Add expense" })
    .click();
  const drawer = page.getByRole("dialog");
  const box = await drawer.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.getByLabel("Description", { exact: true }).focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".summary-rail").getByRole("button", { name: "Add expense" }),
  ).toBeFocused();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});

test("cancellation retains recorded expenses and removes the outing from upcoming", async ({
  page,
}) => {
  await page.goto("/#plan/sample-lunch");
  await page
    .getByRole("button", { name: "Cancel this outing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel outing", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "View A proper team catch-up" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Past and cancelled" }).click();
  await expect(page.locator(".plan-row")).toContainText("Cancelled");
  await navigate(page, "Expenses");
  await expect(page.getByRole("table")).toContainText("Lunch deposit");
  await expect(page.locator(".expense-summary")).toContainText("₦0");
});

test("composer details prefill a draft; live ledger recalculates and survives empty storage", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Describe the outing")
    .fill("Creative clay afternoon for design");
  await page.getByLabel("People", { exact: true }).fill("6");
  await page.getByLabel("Where", { exact: true }).fill("Lekki, Lagos");
  await page.getByLabel("Budget per person (₦)").fill("30000");
  await page.getByLabel("Describe the outing").press("Control+Enter");
  await expect(page.getByLabel("People", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("Where", { exact: true })).toHaveValue(
    "Lekki, Lagos",
  );
  await expect(page.getByLabel("Total budget (NGN)")).toHaveValue("180000");
  await expect(
    page.getByRole("combobox", { name: "Experience", exact: true }),
  ).toHaveValue("clay");
  await expect(page.locator(".cost-ledger .ledger-total")).toContainText(
    "₦132,000",
  );
  await page.getByLabel("People", { exact: true }).fill("4");
  await expect(page.locator(".cost-ledger .ledger-total")).toContainText(
    "₦88,000",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("People", { exact: true })).toHaveValue("4");
  await expect(page.locator(".activity-list")).toContainText(
    "Akin created the draft",
  );
});

test("legacy saved data migrates without losing plans, RSVPs, expenses, or saved ideas", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("teamfare-preview-v1")!);
    data.saved = ["clay"];
    for (const plan of data.plans) {
      delete plan.events;
      delete plan.declined;
      delete plan.location;
      delete plan.reviewNote;
    }
    data.plans[0].going.push("akin");
    data.plans[1].status = "Draft";
    localStorage.setItem("teamfare-preview-v1", JSON.stringify(data));
  });
  await page.goto("/#plan/sample-clay");
  await page.reload();
  await expect(page.getByLabel("Where", { exact: true })).toHaveValue(
    "Lekki, Lagos",
  );
  await send(page);
  await expect(page.locator(".sheet-kicker .status-text")).toHaveText(
    "Awaiting approval",
  );
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("teamfare-preview-v1")!),
  );
  expect(data.plans).toHaveLength(2);
  expect(data.saved).toEqual(["clay"]);
  expect(data.expenses[0].amount).toBe(60000);
  expect(data.plans[0].going).toContain("akin");
  expect(data.plans[0].events).toEqual([]);
});

test("past approved outings settle explicitly and close expense recording", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("teamfare-preview-v1")!);
    data.plans[0].date = "2025-01-01";
    localStorage.setItem("teamfare-preview-v1", JSON.stringify(data));
  });
  await page.goto("/#plan/sample-lunch");
  await page.reload();
  await switchRole(page, "manager");
  await page.getByRole("button", { name: "Mark settled" }).click();
  await expect(page.locator(".sheet-heading .route-line")).toHaveAttribute(
    "aria-label",
    "Step 5 of 5: Settled",
  );
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".activity-list")).toContainText(
    "marked expense recording complete",
  );
  await page.reload();
  await expect(page.locator(".sheet-heading .route-line")).toHaveAttribute(
    "aria-label",
    "Step 5 of 5: Settled",
  );
});

for (const width of [1440, 390]) {
  test(`a complete ${width}px journey preserves a proposal, review, RSVP, expense, and CSV`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await start(page, "Mobile team lunch");
    await send(page);
    await switchRole(page, "manager");
    await page
      .getByRole("button", { name: "Request changes", exact: true })
      .click();
    await page
      .getByLabel("What needs to change?")
      .fill("Please start an hour later.");
    await page.getByRole("button", { name: "Send back with note" }).click();
    await switchRole(page, "employee");
    await page.getByLabel("Time", { exact: true }).fill("14:00");
    await send(page);
    await switchRole(page, "manager");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await switchRole(page, "employee");
    await page.getByRole("button", { name: "Going", exact: true }).click();
    await page
      .locator(".summary-rail")
      .getByRole("button", { name: "Add expense" })
      .click();
    await page
      .getByLabel("Description", { exact: true })
      .fill("Team lunch transport");
    await page.getByLabel("Amount (NGN)").fill("8000");
    await page.getByRole("button", { name: "Record expense" }).click();
    await navigate(page, "Expenses");
    await page
      .getByLabel("Filter expenses by outing")
      .selectOption({ label: "Mobile team lunch" });
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect(
      await readFile((await (await downloaded).path())!, "utf8"),
    ).toContain("Team lunch transport");
    await page.reload();
    await expect(
      page.getByRole("table").filter({ hasText: "Team lunch transport" }),
    ).toBeVisible();
  });
}
