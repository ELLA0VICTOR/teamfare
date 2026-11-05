import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Store, UserRow, PlanRow } from "./store.ts";
import type { Expense, Plan } from "../src/data.ts";
import type {
  Availability,
  AvailabilitySlot,
  Receipt,
} from "../src/workflows.ts";
import {
  calendarFile,
  expenseCsv,
  filteredExpenses,
  outingStart,
} from "../src/workflows.ts";
import { WorkflowError, WorkflowService } from "./workflow-service.ts";
import { digest } from "./auth.ts";

type Context = {
  authenticate: (
    request: FastifyRequest,
    mutation?: boolean,
  ) => { user: UserRow; csrf: string };
  planFor: (id: string, user: UserRow) => { row: PlanRow; plan: Plan };
  write: (plan: Plan, teamId: string, revision: number) => Plan;
};
function fail(status: number, message: string): never {
  throw new WorkflowError(status, message);
}
const event = (text: string) => ({
  id: randomUUID(),
  at: new Date().toISOString(),
  text,
});
const filters = z.object({
  planId: z.string().min(1).max(80).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const receiptLimit = 5 * 1024 * 1024;
const categories = [
  "Good food",
  "Make something",
  "A little adventure",
] as const;

export function registerWorkflowRoutes(
  app: FastifyInstance,
  store: Store,
  workflow: WorkflowService,
  ctx: Context,
) {
  const editable = (plan: Plan, user: UserRow) => {
    if (plan.createdBy !== user.id)
      fail(403, "Only the organiser can change scheduling.");
    if (!["Draft", "Changes requested"].includes(plan.status))
      fail(
        409,
        "Scheduling is closed after submission. Return the proposal to draft first.",
      );
  };
  function availability(plan: Plan, teamId: string): Availability {
    const poll = store.db
      .prepare(
        "SELECT version,slots,closed FROM availability_polls WHERE plan_id=? AND team_id=?",
      )
      .get(plan.id, teamId) as
      { version: number; slots: string; closed: number } | undefined;
    if (!poll)
      return { version: 0, closed: false, slots: [], replies: [], ranking: [] };
    const slots = JSON.parse(poll.slots) as AvailabilitySlot[];
    const rows = store.db
      .prepare(
        "SELECT user_id,available,replied_at FROM availability_replies WHERE plan_id=? AND version=?",
      )
      .all(plan.id, poll.version) as {
      user_id: string;
      available: string;
      replied_at: string;
    }[];
    const replies = rows
      .filter((r) => plan.attendees.includes(r.user_id))
      .map((r) => ({
        userId: r.user_id,
        available: JSON.parse(r.available) as string[],
        repliedAt: r.replied_at,
      }));
    const ranking = slots
      .map((slot) => {
        const yes = replies.filter((r) => r.available.includes(slot.id)).length;
        return {
          id: slot.id,
          available: yes,
          unavailable: replies.length - yes,
          unknown: plan.attendees.length - replies.length,
        };
      })
      .sort(
        (a, b) =>
          b.available - a.available ||
          a.unavailable - b.unavailable ||
          outingStart(slots.find((s) => s.id === a.id)!).getTime() -
            outingStart(slots.find((s) => s.id === b.id)!).getTime(),
      );
    return {
      version: poll.version,
      closed: !!poll.closed,
      slots,
      replies,
      ranking,
    };
  }
  app.get("/api/workflow/preferences", (request) => {
    const { user } = ctx.authenticate(request);
    return {
      outingEmails: !!user.outing_emails,
      interests: JSON.parse(user.interests) as string[],
      judge: store.isJudge(user),
    };
  });
  app.put("/api/workflow/preferences", (request) => {
    const { user } = ctx.authenticate(request, true);
    const input = z
      .object({
        outingEmails: z.boolean(),
        interests: z.array(z.enum(categories)).max(3),
      })
      .strict()
      .parse(request.body);
    if (store.isJudge(user) && input.outingEmails)
      fail(403, "Public judge accounts cannot enable external email.");
    store.transaction(() => {
      store.db
        .prepare("UPDATE users SET outing_emails=?,interests=? WHERE id=?")
        .run(
          input.outingEmails ? 1 : 0,
          JSON.stringify([...new Set(input.interests)]),
          user.id,
        );
      if (!input.outingEmails)
        store.db
          .prepare(
            "UPDATE workflow_emails SET status='suppressed',error='The recipient disabled outing email.' WHERE recipient_id=? AND status='pending' AND kind<>'expense_report'",
          )
          .run(user.id);
    });
    return { ...input, judge: store.isJudge(user) };
  });
  app.get<{ Params: { id: string } }>(
    "/api/plans/:id/availability",
    (request) => {
      const { user } = ctx.authenticate(request),
        { plan } = ctx.planFor(request.params.id, user);
      return availability(plan, user.team_id);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/availability",
    (request) => {
      const { user } = ctx.authenticate(request, true);
      const input = z
        .object({
          version: z.number().int().min(0),
          slots: z
            .array(
              z
                .object({
                  date: z.iso.date(),
                  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                  durationMinutes: z.number().int().min(30).max(480),
                })
                .strict(),
            )
            .min(2)
            .max(6),
        })
        .strict()
        .parse(request.body);
      return store.transaction(() => {
        const { plan } = ctx.planFor(request.params.id, user);
        editable(plan, user);
        if (availability(plan, user.team_id).version !== input.version)
          fail(
            409,
            "Availability options changed. Refresh before replacing them.",
          );
        if (
          new Set(input.slots.map((s) => s.date + "T" + s.time)).size !==
          input.slots.length
        )
          fail(400, "Choose distinct times.");
        if (input.slots.some((s) => outingStart(s).getTime() <= Date.now()))
          fail(400, "Availability options must be in the future.");
        const slots = input.slots.map((s) => ({ ...s, id: randomUUID() })),
          version = input.version + 1;
        store.db
          .prepare(
            "INSERT INTO availability_polls(plan_id,team_id,version,slots,closed) VALUES(?,?,?,?,0) ON CONFLICT(plan_id) DO UPDATE SET version=excluded.version,slots=excluded.slots,closed=0",
          )
          .run(plan.id, user.team_id, version, JSON.stringify(slots));
        store.db
          .prepare("DELETE FROM availability_replies WHERE plan_id=?")
          .run(plan.id);
        store.db
          .prepare(
            "UPDATE workflow_emails SET status='cancelled',error='Availability options were replaced.' WHERE plan_id=? AND kind='availability' AND status='pending'",
          )
          .run(plan.id);
        for (const id of plan.attendees) {
          const recipient = store.user(id);
          if (recipient && id !== user.id)
            workflow.enqueue({
              teamId: user.team_id,
              planId: plan.id,
              recipient,
              kind: "availability",
              dedupe: `availability/${plan.id}/${version}/${id}`,
              subject: "Which time works? " + plan.title,
              text: `${user.name} proposed outing times for ${plan.title}. Open Teamfare to reply: ${workflow.origin}/#plan/${encodeURIComponent(plan.id)}\nTimes are in Africa/Lagos. Manage outing email preferences in your account.`,
              expires: Math.min(...slots.map((s) => outingStart(s).getTime())),
            });
        }
        return availability(plan, user.team_id);
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/availability/reply",
    (request) => {
      const { user } = ctx.authenticate(request, true),
        input = z
          .object({
            version: z.number().int().positive(),
            available: z.array(z.uuid()).max(6),
          })
          .strict()
          .parse(request.body);
      return store.transaction(() => {
        const { plan } = ctx.planFor(request.params.id, user),
          poll = availability(plan, user.team_id);
        if (!plan.attendees.includes(user.id))
          fail(403, "Only invited teammates can reply to availability.");
        if (
          poll.closed ||
          !poll.version ||
          poll.version !== input.version ||
          !["Draft", "Changes requested"].includes(plan.status)
        )
          fail(409, "These availability options are no longer open.");
        if (input.available.some((id) => !poll.slots.some((s) => s.id === id)))
          fail(400, "Choose only the current availability options.");
        store.db
          .prepare(
            "INSERT INTO availability_replies(plan_id,user_id,version,available,replied_at) VALUES(?,?,?,?,?) ON CONFLICT(plan_id,user_id) DO UPDATE SET version=excluded.version,available=excluded.available,replied_at=excluded.replied_at",
          )
          .run(
            plan.id,
            user.id,
            poll.version,
            JSON.stringify([...new Set(input.available)]),
            new Date().toISOString(),
          );
        return availability(plan, user.team_id);
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/availability/apply",
    (request) => {
      const { user } = ctx.authenticate(request, true),
        input = z
          .object({
            version: z.number().int().positive(),
            revision: z.number().int().positive(),
            slotId: z.uuid(),
            acknowledgeConflicts: z.boolean().default(false),
          })
          .strict()
          .parse(request.body);
      return store.transaction(() => {
        const { plan, row } = ctx.planFor(request.params.id, user);
        editable(plan, user);
        const poll = availability(plan, user.team_id),
          slot = poll.slots.find((s) => s.id === input.slotId),
          rank = poll.ranking.find((s) => s.id === input.slotId);
        if (
          !slot ||
          poll.closed ||
          poll.version !== input.version ||
          row.revision !== input.revision
        )
          fail(
            409,
            "The poll or plan changed. Refresh before choosing a time.",
          );
        if (outingStart(slot).getTime() <= Date.now())
          fail(400, "Choose a future time.");
        if (
          rank!.available < plan.attendees.length &&
          !input.acknowledgeConflicts
        )
          fail(
            400,
            "Some guests are unavailable or have not replied. Acknowledge this before choosing the time.",
          );
        const shift =
          Number(slot.time.slice(0, 2)) * 60 +
          Number(slot.time.slice(3)) -
          (Number(plan.time.slice(0, 2)) * 60 + Number(plan.time.slice(3)));
        const proposal = plan.proposal
          ? {
              ...plan.proposal,
              organiserEdited: true,
              itinerary: plan.proposal.itinerary.map((item) => {
                const minutes =
                  Number(item.time.slice(0, 2)) * 60 +
                  Number(item.time.slice(3)) +
                  shift;
                if (minutes < 0 || minutes >= 1440)
                  fail(
                    400,
                    "This time would move itinerary steps into another day. Adjust the itinerary first.",
                  );
                return {
                  ...item,
                  time: `${Math.floor(minutes / 60)
                    .toString()
                    .padStart(
                      2,
                      "0",
                    )}:${(minutes % 60).toString().padStart(2, "0")}`,
                };
              }),
            }
          : undefined;
        const saved = ctx.write(
          {
            ...plan,
            date: slot.date,
            time: slot.time,
            durationMinutes: slot.durationMinutes,
            proposal,
            events: [
              ...(plan.events ?? []),
              event(
                `${user.name} chose an outing time after ${poll.replies.length} availability replies; ${rank!.available} of ${plan.attendees.length} guests marked it available.`,
              ),
            ],
          },
          user.team_id,
          row.revision,
        );
        store.db
          .prepare("UPDATE availability_polls SET closed=1 WHERE plan_id=?")
          .run(plan.id);
        store.db
          .prepare(
            "UPDATE workflow_emails SET status='cancelled',error='An outing time was chosen.' WHERE plan_id=? AND kind='availability' AND status='pending'",
          )
          .run(plan.id);
        return saved;
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/plans/:id/calendar",
    (request, reply) => {
      const { user } = ctx.authenticate(request),
        { plan } = ctx.planFor(request.params.id, user);
      if (!["Approved", "Cancelled"].includes(plan.status))
        fail(409, "Calendar export is available after approval.");
      return reply
        .header("Content-Type", "text/calendar; charset=utf-8")
        .header(
          "Content-Disposition",
          'attachment; filename="teamfare-outing.ics"',
        )
        .send(calendarFile(plan, workflow.origin));
    },
  );
  app.get("/api/workflow/emails", (request) => {
    const { user } = ctx.authenticate(request);
    return workflow.list(user.team_id, user);
  });
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/invitations",
    (request) => {
      const { user } = ctx.authenticate(request, true),
        input = z.object({ requestId: z.uuid() }).strict().parse(request.body);
      return store.transaction(() => {
        const { plan, row } = ctx.planFor(request.params.id, user);
        if (plan.createdBy !== user.id && user.role !== "manager")
          fail(403, "Only the organiser or a manager can request invitations.");
        if (
          plan.status !== "Approved" ||
          plan.settledAt ||
          outingStart(plan).getTime() <= Date.now()
        )
          fail(409, "Invitations require a future approved, unsettled outing.");
        const existing = store.db
          .prepare(
            "SELECT id FROM workflow_emails WHERE dedupe LIKE ? AND plan_id=? LIMIT 1",
          )
          .get(`invitation/${plan.id}/${input.requestId}/%`, plan.id);
        if (existing) return { requested: true };
        const recent = store.db
          .prepare(
            "SELECT count(*) AS n FROM workflow_emails WHERE plan_id=? AND kind='invitation' AND created_at>=?",
          )
          .get(plan.id, Date.now() - 86400000) as { n: number };
        if (recent.n >= 50)
          fail(429, "This outing reached its daily invitation limit.");
        const next = ctx.write(
          {
            ...plan,
            emailGuests: true,
            events: [
              ...(plan.events ?? []),
              event(
                `${user.name} requested invitation emails for guests who enabled outing email.`,
              ),
            ],
          },
          user.team_id,
          row.revision,
        );
        workflow.invite(next, user.team_id, input.requestId);
        return { requested: true };
      });
    },
  );
  app.get<{ Params: { id: string } }>("/api/plans/:id/emails", (request) => {
    const { user } = ctx.authenticate(request),
      { plan } = ctx.planFor(request.params.id, user);
    return workflow.list(user.team_id, user, plan);
  });
  app.post<{ Params: { id: string } }>("/api/invites/:id/email", (request) => {
    const { user } = ctx.authenticate(request, true);
    if (user.role !== "manager" || store.isJudge(user))
      fail(403, "Only a private team's manager can email invitations.");
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        code: z.string().min(20).max(128),
      })
      .strict()
      .parse(request.body);
    if (input.email.endsWith(".invalid"))
      fail(400, "Choose a deliverable email address.");
    return store.transaction(() => {
      const invite = store.db
        .prepare(
          "SELECT id,token_hash,recipient_email FROM invites WHERE id=? AND team_id=? AND used_by IS NULL AND expires>?",
        )
        .get(request.params.id, user.team_id, Date.now()) as
        | { id: string; token_hash: string; recipient_email: string | null }
        | undefined;
      if (!invite || invite.token_hash !== digest(input.code))
        fail(400, "The invitation is invalid or expired.");
      if (invite.recipient_email && invite.recipient_email !== input.email)
        fail(
          409,
          "This invitation is already addressed to someone else. Create another invitation.",
        );
      const recent = store.db
        .prepare(
          "SELECT count(*) AS n FROM workflow_emails WHERE team_id=? AND kind='member_invite' AND created_at>=?",
        )
        .get(user.team_id, Date.now() - 86400000) as { n: number };
      if (recent.n >= 20)
        fail(429, "This team reached its daily email invitation limit.");
      store.db
        .prepare("UPDATE invites SET recipient_email=? WHERE id=?")
        .run(input.email, invite.id);
      const team = store.db
        .prepare("SELECT name FROM teams WHERE id=?")
        .get(user.team_id) as { name: string };
      const id = workflow.enqueue({
        teamId: user.team_id,
        to: input.email,
        kind: "member_invite",
        dedupe: `member-invite/${invite.id}/${digest(input.email)}`,
        subject: "You're invited to " + team.name + " on Teamfare",
        text: `${user.name} invited you to ${team.name}. Open ${workflow.origin}, choose Join a team, and use this single-use code:\n\n${input.code}\n\nThe code expires in three days and is restricted to ${input.email}. Verify your own email to join. Ignore this message if you were not expecting an invitation.`,
        requireOptIn: false,
      });
      return { id, status: workflow.status(id) };
    });
  });
  app.post("/api/reports/expenses/email", (request) => {
    const { user } = ctx.authenticate(request, true);
    if (user.role !== "manager" || store.isJudge(user))
      fail(403, "Only a private team's manager can email expense reports.");
    const input = filters
      .extend({ recipientId: z.string().max(80), requestId: z.uuid() })
      .strict()
      .parse(request.body);
    if (input.from && input.to && input.from > input.to)
      fail(400, "The end date must be on or after the start date.");
    return store.transaction(() => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            planId: input.planId ?? null,
            from: input.from ?? null,
            to: input.to ?? null,
            recipientId: input.recipientId,
          }),
        )
        .digest("hex");
      const old = store.db
        .prepare(
          "SELECT id,request_hash FROM workflow_emails WHERE dedupe=? AND team_id=?",
        )
        .get(`report/${user.id}/${input.requestId}`, user.team_id) as
        { id: string; request_hash: string } | undefined;
      if (old) {
        if (old.request_hash !== requestHash)
          fail(
            409,
            "That report request was already used with different filters or recipient. Create a fresh request.",
          );
        return { id: old.id, status: workflow.status(old.id) };
      }
      const recipient = store.user(input.recipientId);
      if (
        !recipient ||
        recipient.team_id !== user.team_id ||
        !recipient.email_verified_at ||
        store.isJudge(recipient)
      )
        fail(400, "Choose a verified recipient from this team.");
      if (input.planId) ctx.planFor(input.planId, user);
      const recent = store.db
        .prepare(
          "SELECT count(*) AS n FROM workflow_emails WHERE team_id=? AND kind='expense_report' AND created_at>=?",
        )
        .get(user.team_id, Date.now() - 86400000) as { n: number };
      if (recent.n >= 10)
        fail(429, "This team reached its daily report-email limit.");
      const state = store.state(user),
        expenses = filteredExpenses(state.expenses, input);
      if (!expenses.length)
        fail(400, "There are no matching expenses to email.");
      if (expenses.length > 2000)
        fail(400, "Narrow the date range to at most 2,000 expenses.");
      const csv = expenseCsv(expenses, state.plans);
      if (Buffer.byteLength(csv) > 1024 * 1024)
        fail(400, "Narrow this report to less than 1 MB.");
      const total = expenses.reduce((n, e) => n + e.amount, 0);
      const id = workflow.enqueue({
        teamId: user.team_id,
        recipient,
        kind: "expense_report",
        dedupe: `report/${user.id}/${input.requestId}`,
        subject: "Teamfare expense report",
        text: `${user.name} requested this expense report for you.\nExpense dates: ${input.from ?? "all dates"} to ${input.to ?? "all dates"} (inclusive).\n${expenses.length} records; NGN ${total.toLocaleString("en-NG")} total.\nThe attached CSV contains the selected records. No payment or reimbursement has been initiated.`,
        attachments: [
          {
            filename: "teamfare-expenses.csv",
            content: Buffer.from(csv).toString("base64"),
          },
        ],
        requireOptIn: false,
      });
      store.db
        .prepare("UPDATE workflow_emails SET request_hash=? WHERE id=?")
        .run(requestHash, id);
      return { id, status: workflow.status(id) };
    });
  });
  app.addContentTypeParser(
    ["image/png", "image/jpeg", "application/pdf"],
    { parseAs: "buffer", bodyLimit: receiptLimit },
    (_request, body, done) => done(null, body),
  );
  function receiptExpense(id: string, user: UserRow, mutation = false) {
    const row = store.db
      .prepare(
        "SELECT created_by,plan_id,data FROM expenses WHERE id=? AND team_id=?",
      )
      .get(id, user.team_id) as
      { created_by: string; plan_id: string; data: string } | undefined;
    if (!row) fail(404, "Expense not found.");
    const expense = JSON.parse(row.data) as Expense & { payerId?: string };
    if (
      user.role !== "manager" &&
      row.created_by !== user.id &&
      expense.payerId !== user.id
    )
      fail(
        403,
        "Only the expense owner, payer or a manager can access its receipt.",
      );
    const { plan } = ctx.planFor(row.plan_id, user);
    if (mutation && (plan.status !== "Approved" || plan.settledAt))
      fail(409, "Receipts can only change on an approved, unsettled outing.");
    return { row, plan };
  }
  app.post<{ Params: { id: string } }>(
    "/api/expenses/:id/receipt",
    {
      bodyLimit: receiptLimit,
      onRequest: async (request) => {
        ctx.authenticate(request, true);
      },
    },
    (request, reply) => {
      const { user } = ctx.authenticate(request, true);
      receiptExpense(request.params.id, user, true);
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes) || !bytes.length)
        fail(400, "Choose a PDF, JPEG or PNG receipt up to 5 MB.");
      const mime = String(request.headers["content-type"] ?? "").split(";")[0],
        valid =
          mime === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : mime === "image/jpeg"
              ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              : mime === "application/pdf"
                ? bytes.subarray(0, 5).toString() === "%PDF-"
                : false;
      if (!valid)
        fail(400, "The receipt contents do not match a supported file type.");
      let name: string;
      try {
        name = decodeURIComponent(
          String(request.headers["x-receipt-name"] ?? "receipt"),
        );
      } catch {
        fail(400, "Invalid receipt filename.");
      }
      name =
        name!
          .split("")
          .map((char) =>
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127 ||
            char === "/" ||
            char === "\\"
              ? "_"
              : char,
          )
          .join("")
          .trim()
          .slice(0, 160) || "receipt";
      return store.transaction(() => {
        const { plan } = receiptExpense(request.params.id, user, true),
          hash = createHash("sha256").update(bytes).digest("hex");
        const old = store.db
          .prepare("SELECT id,sha256 FROM receipts WHERE expense_id=?")
          .get(request.params.id) as { id: string; sha256: string } | undefined;
        if (old) {
          if (old.sha256 === hash) return { id: old.id };
          fail(
            409,
            "Remove the existing receipt before uploading a different one.",
          );
        }
        const used = store.db
          .prepare(
            "SELECT coalesce(sum(size),0) AS n FROM receipts WHERE team_id=?",
          )
          .get(user.team_id) as { n: number };
        if (used.n + bytes.length > 100 * 1024 * 1024)
          fail(413, "This team's 100 MB receipt allowance is full.");
        const total = store.db
          .prepare("SELECT coalesce(sum(size),0) AS n FROM receipts")
          .get() as { n: number };
        if (total.n + bytes.length > 512 * 1024 * 1024)
          fail(413, "Receipt storage is full. Contact the administrator.");
        const receipt: Receipt = {
          id: randomUUID(),
          name,
          mime,
          size: bytes.length,
          createdAt: new Date().toISOString(),
        };
        store.db
          .prepare(
            "INSERT INTO receipts(id,expense_id,team_id,user_id,name,mime,size,sha256,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            receipt.id,
            request.params.id,
            user.team_id,
            user.id,
            name,
            mime,
            bytes.length,
            hash,
            bytes,
            receipt.createdAt,
          );
        ctx.write(
          {
            ...plan,
            events: [
              ...(plan.events ?? []),
              event(`${user.name} attached a receipt to an expense.`),
            ],
          },
          user.team_id,
          plan.revision!,
        );
        return reply.code(201).send(receipt);
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/expenses/:id/receipt",
    (request, reply) => {
      const { user } = ctx.authenticate(request);
      receiptExpense(request.params.id, user);
      const row = store.db
        .prepare(
          "SELECT name,mime,bytes FROM receipts WHERE expense_id=? AND team_id=?",
        )
        .get(request.params.id, user.team_id) as
        { name: string; mime: string; bytes: Uint8Array } | undefined;
      if (!row) fail(404, "Receipt not found.");
      return reply
        .header("Content-Type", row.mime)
        .header(
          "Content-Disposition",
          `attachment; filename="receipt"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
        )
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox; default-src 'none'")
        .send(Buffer.from(row.bytes));
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/expenses/:id/receipt",
    (request) => {
      const { user } = ctx.authenticate(request, true);
      const input = z
        .object({ receiptId: z.uuid() })
        .strict()
        .parse(request.body);
      return store.transaction(() => {
        const { plan } = receiptExpense(request.params.id, user, true);
        const removed = store.db
          .prepare(
            "DELETE FROM receipts WHERE id=? AND expense_id=? AND team_id=?",
          )
          .run(input.receiptId, request.params.id, user.team_id);
        if (!removed.changes)
          fail(409, "The receipt changed. Refresh before removing it.");
        ctx.write(
          {
            ...plan,
            events: [
              ...(plan.events ?? []),
              event(`${user.name} removed an expense receipt.`),
            ],
          },
          user.team_id,
          plan.revision!,
        );
        return { removed: true };
      });
    },
  );
}
