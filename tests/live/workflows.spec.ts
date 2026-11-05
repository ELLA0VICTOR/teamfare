import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { verifiedAccount } from "../account-helpers";

test("real member UI coordinates availability, invitations, calendar, receipts and emailed filtered reports", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const origin = "http://127.0.0.1:5178",
    suffix = crypto.randomUUID().slice(0, 8),
    password = "Workflow browser passphrase 2026!";
  const managerContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    }),
    employeeContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 390, height: 844 },
    });
  const managerEmail = `workflow-manager-${suffix}@example.test`,
    employeeEmail = `workflow-employee-${suffix}@example.test`;
  const managerResponse = await verifiedAccount(
      managerContext.request,
      "/api/auth/register",
      {
        name: "Workflow Manager",
        email: managerEmail,
        password,
        teamName: "Workflow team " + suffix,
        outingEmails: true,
      },
      origin,
      3002,
    ),
    owner = await managerResponse.json();
  const invite = await managerContext.request.post("/api/invites", {
    headers: { origin, "X-CSRF-Token": owner.csrfToken },
    data: { role: "employee" },
  });
  const employeeResponse = await verifiedAccount(
      employeeContext.request,
      "/api/auth/join",
      {
        name: "Workflow Organiser",
        email: employeeEmail,
        password,
        inviteCode: (await invite.json()).code,
        outingEmails: true,
      },
      origin,
      3002,
    ),
    employeeAccount = await employeeResponse.json();
  const date = new Date();
  date.setDate(date.getDate() + 3);
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const created = await employeeContext.request.post("/api/plans", {
    headers: { origin, "X-CSRF-Token": employeeAccount.csrfToken },
    data: {
      experienceId: "long-table",
      title: "A coordinated team lunch",
      date: iso,
      time: "13:00",
      people: 2,
      budget: 100000,
      location: "Victoria Island, Lagos",
      note: "Confirm availability with the venue.",
      attendees: [employeeAccount.user.id, owner.user.id],
      emailGuests: true,
      durationMinutes: 120,
    },
  });
  expect(created.status()).toBe(201);
  const plan = await created.json();
  const employee = await employeeContext.newPage(),
    manager = await managerContext.newPage(),
    errors: string[] = [];
  for (const page of [employee, manager])
    page.on("pageerror", (e) => errors.push(e.message));
  try {
    await employee.goto("/#plan/" + plan.id);
    await employee
      .getByRole("button", { name: "Propose times", exact: true })
      .click();
    await employee
      .getByRole("button", { name: "Ask for availability", exact: true })
      .click();
    await expect(
      employee.getByText("0 of 2 named guests replied."),
    ).toBeVisible();
    await employee.getByLabel("Works for me").first().check();
    await employee
      .getByRole("button", { name: "Save availability", exact: true })
      .click();
    await manager.goto("/#plan/" + plan.id);
    await manager.getByLabel("Works for me").first().check();
    await manager
      .getByRole("button", { name: "Save availability", exact: true })
      .click();
    await employee.reload();
    await expect(
      employee.getByText("2 of 2 named guests replied."),
    ).toBeVisible();
    await employee
      .getByRole("button", { name: "Choose this time", exact: true })
      .first()
      .click();
    await expect(
      employee.getByText(/Time chosen; replies are closed/),
    ).toBeVisible();
    await employee
      .getByRole("button", { name: "Send to Workflow Manager for approval" })
      .click();
    await expect(employee.locator(".sheet-kicker")).toContainText(
      "Awaiting approval",
    );
    await manager.reload();
    await manager.getByRole("button", { name: "Approve", exact: true }).click();
    await employee.reload();
    await expect(employee.locator(".sheet-kicker")).toContainText("Approved");
    const calendarDownload = employee.waitForEvent("download");
    await employee
      .getByRole("link", { name: "Download calendar event" })
      .click();
    const calendar = await readFile(
      (await (await calendarDownload).path())!,
      "utf8",
    );
    expect(calendar).toContain("BEGIN:VEVENT");
    expect(calendar).toContain("DTSTART:");
    await employee.getByRole("button", { name: "Going", exact: true }).click();
    await employee
      .locator(".summary-rail")
      .getByRole("button", { name: "Add expense" })
      .click();
    await employee
      .getByLabel("Description", { exact: true })
      .fill("=Receipt-backed meal");
    await employee.getByLabel("Amount (NGN)").fill("12000");
    await employee
      .getByLabel("Receipt (optional)")
      .setInputFiles({
        name: "meal-receipt.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nPrivate receipt fixture\n%%EOF"),
      });
    await employee
      .getByRole("button", { name: "Record expense", exact: true })
      .click();
    await expect(
      employee.getByRole("link", { name: /Download receipt/ }),
    ).toBeVisible();
    await manager.goto("/#expenses");
    await manager.reload();
    await expect(manager.getByRole("table")).toContainText(
      "=Receipt-backed meal",
    );
    await manager.getByLabel("Filter expenses by outing").selectOption(plan.id);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await manager.getByLabel("From date", { exact: true }).fill(today);
    await manager.getByLabel("To date", { exact: true }).fill(today);
    await manager
      .getByRole("button", { name: "Email report", exact: true })
      .click();
    await manager
      .getByRole("button", { name: "Email this report", exact: true })
      .click();
    await expect(manager.getByText(/Report requested/)).toBeVisible();
    await expect
      .poll(
        async () => {
          const messages = JSON.parse(
            await readFile(".artifacts/live-mailbox.json", "utf8"),
          ) as {
            to: string;
            subject: string;
            attachments?: { content: string }[];
          }[];
          const report = messages.findLast(
            (m) =>
              m.to === managerEmail && m.subject === "Teamfare expense report",
          );
          return report?.attachments?.[0]
            ? Buffer.from(report.attachments[0].content, "base64").toString()
            : "";
        },
        { timeout: 60000, intervals: [1000, 2000] },
      )
      .toContain("'=Receipt-backed meal");
    await mkdir(".artifacts/workflow-verification", { recursive: true });
    await employee.screenshot({
      path: ".artifacts/workflow-verification/plan-mobile.png",
      fullPage: true,
    });
    expect(
      await employee.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await manager
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const receiptDownload = manager.waitForEvent("download");
    await manager.getByRole("link", { name: /Download receipt/ }).click();
    expect(
      (await readFile((await (await receiptDownload).path())!)).toString(),
    ).toContain("Private receipt fixture");
    await manager.screenshot({
      path: ".artifacts/workflow-verification/expenses-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await managerContext.close();
    await employeeContext.close();
  }
});
