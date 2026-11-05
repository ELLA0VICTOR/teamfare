import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { experiences, money } from "../src/data.ts";
import type { Plan } from "../src/data.ts";
import { Store } from "./store.ts";
import { ResearchService, ResearchError } from "./agent/service.ts";
import type { AgentProviders } from "./agent/providers.ts";
import { costSchema, itinerarySchema } from "./agent/runner.ts";
import { costTotal } from "../src/research.ts";
import type { UserRow } from "./store.ts";
import { registerIdentity, IdentityError } from "./identity.ts";
import type { AuthMailer } from "./mail.ts";
import { MailError } from "./mail.ts";
import { digest, hashPassword, sessionCookie, token } from "./auth.ts";
import { WorkflowError, WorkflowService } from "./workflow-service.ts";
import { registerWorkflowRoutes } from "./workflow-routes.ts";
import { outingStart } from "../src/workflows.ts";
import { CurrencyService } from "./currency.ts";

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const text = (max: number) => z.string().trim().min(1).max(max);
const dateSchema = z.iso.date();
const details = z
  .object({
    experienceId: text(80),
    title: text(80),
    date: dateSchema,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    people: z.number().int().min(2).max(20),
    budget: z.number().int().min(0).max(100000000),
    location: text(100),
    note: z.string().trim().max(500),
    attendees: z.array(z.string()).max(20),
    durationMinutes: z.number().int().min(30).max(480).optional(),
    emailGuests: z.boolean().optional(),
  })
  .strict();
const preferences = [
  "No preference",
  "Vegetarian options",
  "Vegan options",
  "Halal options",
] as const;
type SessionRow = {
  user_id: string;
  csrf: string;
  expires: number;
  last_seen: number;
};
type Auth = { user: UserRow; csrf: string };
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const nowEvent = (message: string) => ({
  id: randomUUID(),
  at: new Date().toISOString(),
  text: message,
});

export async function createApp(
  options: {
    databasePath?: string;
    origin?: string;
    production?: boolean;
    serveStatic?: boolean;
    authLimit?: number;
    agentProviders?: AgentProviders;
    mailer?: AuthMailer;
    authSecret?: string;
  } = {},
) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin = new URL(
    options.origin ?? process.env.APP_ORIGIN ?? "http://localhost:5173",
  ).origin;
  if (production && !origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  if (production && options.agentProviders)
    throw new Error("Injected test providers are not allowed in production.");
  const store = new Store(
    options.databasePath ??
      process.env.DATABASE_PATH ??
      "./data/teamfare.sqlite",
  );
  const app = Fastify({
    bodyLimit: 32 * 1024,
    logger: false,
    trustProxy:
      process.env.TRUST_PROXY === "1"
        ? (_address: string, hop: number) => hop === 0
        : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 180,
    timeWindow: "1 minute",
    keyGenerator(request) {
      const value = request.cookies[sessionCookie];
      if (value && value.length <= 256) {
        const session = store.db
          .prepare(
            "SELECT user_id FROM sessions WHERE hash=? AND expires>? AND last_seen>?",
          )
          .get(digest(value), Date.now(), Date.now() - 30 * 60000) as
          { user_id: string } | undefined;
        if (session) return "member:" + session.user_id;
      }
      return "ip:" + request.ip;
    },
  });
  const dummyPassword = await hashPassword(token());
  const research = new ResearchService(store, options.agentProviders);
  const workflows = new WorkflowService(store, origin, {
    mailer: options.mailer,
    secret: options.authSecret ?? process.env.AUTH_SECRET ?? "",
  });
  app.addHook("onReady", async () => {
    workflows.start();
  });
  app.addHook("onClose", async () => {
    await workflows.close();
    await research.close();
    store.close();
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY");
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    if (production)
      reply
        .header("Strict-Transport-Security", "max-age=31536000")
        .header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.origin !== origin
    )
      fail(403, "Request origin is not allowed.");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: error.issues[0]?.message ?? "Check the submitted fields.",
      });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof ResearchError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof WorkflowError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof IdentityError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof MailError)
      return reply.code(503).send({ error: error.message });
    const known = error as { statusCode?: number; message?: string };
    const status =
      typeof known.statusCode === "number" ? known.statusCode : 500;
    return reply.code(status).send({
      error:
        status >= 500
          ? "The server could not complete this request."
          : (known.message ?? "Invalid request."),
    });
  });
  function authenticate(request: FastifyRequest, mutation = false): Auth {
    const value = request.cookies[sessionCookie];
    if (!value || value.length > 256) return fail(401, "Sign in to continue.");
    const session = store.db
      .prepare(
        "SELECT user_id,csrf,expires,last_seen FROM sessions WHERE hash = ?",
      )
      .get(digest(value)) as SessionRow | undefined;
    if (
      !session ||
      session.expires <= Date.now() ||
      session.last_seen <= Date.now() - 30 * 60 * 1000
    )
      return fail(401, "Your session has expired. Sign in again.");
    const user = store.user(session.user_id);
    if (!user) return fail(401, "Sign in to continue.");
    if (!user.email_verified_at)
      return fail(401, "Verify your email by signing in again.");
    if (mutation && request.headers["x-csrf-token"] !== session.csrf)
      return fail(403, "Refresh the page and try again.");
    if (session.last_seen < Date.now() - 60000)
      store.db
        .prepare("UPDATE sessions SET last_seen=? WHERE hash=?")
        .run(Date.now(), digest(value));
    return { user, csrf: session.csrf };
  }
  function snapshot(auth: Auth) {
    const team = store.db
      .prepare("SELECT id,name FROM teams WHERE id = ?")
      .get(auth.user.team_id);
    return {
      user: {
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        role: auth.user.role,
        judge: store.isJudge(auth.user),
        outingEmails: !!auth.user.outing_emails,
        interests: JSON.parse(auth.user.interests) as string[],
      },
      team,
      members: store.members(auth.user.team_id),
      csrfToken: auth.csrf,
      state: store.state(auth.user),
    };
  }
  function session(user: UserRow, reply: FastifyReply) {
    const value = token(),
      csrf = token();
    store.db.prepare("DELETE FROM sessions WHERE expires <= ?").run(Date.now());
    store.db
      .prepare(
        "INSERT INTO sessions(hash,user_id,csrf,expires,last_seen) VALUES(?,?,?,?,?)",
      )
      .run(digest(value), user.id, csrf, Date.now() + 7 * 86400000, Date.now());
    reply.setCookie(sessionCookie, value, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });
    return snapshot({ user, csrf });
  }
  const planFor = (id: string, user: UserRow) => {
    const row = store.plan(id, user.team_id);
    if (!row) return fail(404, "Plan not found.");
    return {
      row,
      plan: { ...(JSON.parse(row.data) as Plan), revision: row.revision },
    };
  };
  function validDetails(
    input: z.infer<typeof details>,
    user: UserRow,
    previous?: Plan,
  ) {
    const experience = experiences.find(
      (item) => item.id === input.experienceId,
    );
    const researched =
      input.experienceId === "researched" && previous?.proposal;
    if (!experience && !researched)
      return fail(400, "Choose a valid experience.");
    const capacity = experience?.capacity ?? 20;
    if (input.people > capacity)
      return fail(400, `This experience supports up to ${capacity} people.`);
    if (input.date < today()) return fail(400, "Choose today or a later date.");
    const team = store.members(user.team_id);
    const attendees = [...new Set(input.attendees)];
    if (
      !attendees.includes(user.id) ||
      attendees.length > input.people ||
      attendees.some((id) => !team.some((member) => member.id === id))
    )
      return fail(
        400,
        "Attendees must belong to your team and include the organiser.",
      );
    return {
      ...input,
      attendees,
      unitPrice: researched
        ? costTotal(researched.costs, input.people) / input.people
        : experience!.price,
    };
  }
  function write(plan: Plan, teamId: string, revision: number) {
    return store.transaction(() => {
      const previous = store.plan(plan.id, teamId);
      const result = store.db
        .prepare(
          "UPDATE plans SET data = ?, revision = revision + 1 WHERE id = ? AND team_id = ? AND revision = ?",
        )
        .run(JSON.stringify(plan), plan.id, teamId, revision);
      if (Number(result.changes) !== 1)
        fail(
          409,
          "This plan changed elsewhere. Refresh and review the latest version.",
        );
      const saved = { ...plan, revision: revision + 1 };
      if (previous)
        workflows.planChanged(JSON.parse(previous.data) as Plan, saved, teamId);
      return saved;
    });
  }
  const currencies = new CurrencyService(store);
  app.get("/api/currency", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return currencies.current();
  });
  registerWorkflowRoutes(app, store, workflows, {
    authenticate,
    planFor,
    write,
    currencies,
  });
  app.get("/api/health", async () => {
    store.db
      .prepare(
        "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
      )
      .get();
    return { ok: true };
  });
  app.get("/api/session", async (request) => {
    if (!request.cookies[sessionCookie]) return { user: null };
    try {
      return snapshot(authenticate(request));
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401)
        return { user: null };
      throw error;
    }
  });
  registerIdentity(app, store, {
    production,
    authLimit: options.authLimit ?? 10,
    mailer: options.mailer,
    secret: options.authSecret,
    authenticate,
    session,
    dummyPassword,
  });
  app.post("/api/auth/logout", async (request, reply) => {
    authenticate(request, true);
    store.db
      .prepare("DELETE FROM sessions WHERE hash = ?")
      .run(digest(request.cookies[sessionCookie]!));
    reply.clearCookie(sessionCookie, {
      path: "/",
      secure: production,
      httpOnly: true,
      sameSite: "lax",
    });
    return { ok: true };
  });
  app.post("/api/invites", async (request) => {
    const { user } = authenticate(request, true);
    if (store.isJudge(user))
      return fail(
        403,
        "Shared judge accounts cannot invite people. Create your own team for private use.",
      );
    if (user.role !== "manager")
      return fail(403, "Only a manager can invite teammates.");
    const input = z
      .object({ role: z.enum(["employee", "manager"]).default("employee") })
      .strict()
      .parse(request.body);
    const value = token(),
      id = randomUUID(),
      expires = Date.now() + 3 * 86400000;
    store.db
      .prepare(
        "INSERT INTO invites(id,team_id,token_hash,role,created_by,expires) VALUES(?,?,?,?,?,?)",
      )
      .run(id, user.team_id, digest(value), input.role, user.id, expires);
    return {
      id,
      code: value,
      expiresAt: new Date(expires).toISOString(),
      role: input.role,
    };
  });
  app.get("/api/state", async (request) => snapshot(authenticate(request)));
  app.get("/api/research/config", async (request) => {
    authenticate(request);
    return research.setup();
  });
  app.post("/api/research", async (request) =>
    research.start(authenticate(request, true).user, request.body),
  );
  app.get<{ Params: { id: string } }>("/api/research/:id", async (request) =>
    research.read(request.params.id, authenticate(request).user),
  );
  app.post<{ Params: { id: string } }>(
    "/api/research/:id/cancel",
    async (request) =>
      research.cancel(request.params.id, authenticate(request, true).user),
  );
  app.post<{ Params: { id: string } }>(
    "/api/research/:id/accept",
    async (request) => {
      const { user } = authenticate(request, true);
      const input = z
        .object({ optionId: z.uuid() })
        .strict()
        .parse(request.body);
      return research.accept(request.params.id, user, input.optionId);
    },
  );
  app.post("/api/plans", async (request, reply) => {
    const { user } = authenticate(request, true);
    const input = validDetails(details.parse(request.body), user);
    const plan: Plan = {
      ...input,
      id: randomUUID(),
      createdBy: user.id,
      status: "Draft",
      going: [],
      declined: [],
      events: [nowEvent(`${user.name} created the draft.`)],
      revision: 1,
    };
    store.db
      .prepare("INSERT INTO plans(id,team_id,creator_id,data) VALUES(?,?,?,?)")
      .run(plan.id, user.team_id, user.id, JSON.stringify(plan));
    return reply.code(201).send(plan);
  });
  app.put<{ Params: { id: string } }>("/api/plans/:id", async (request) => {
    const { user } = authenticate(request, true);
    const { plan, row } = planFor(request.params.id, user);
    const input = details
      .extend({
        revision: z.number().int().positive(),
        submit: z.boolean().default(false),
        costs: z
          .array(costSchema.pick({ label: true, amount: true, unit: true }))
          .min(1)
          .max(6)
          .optional(),
        itinerary: itinerarySchema.optional(),
      })
      .parse(request.body);
    if (row.creator_id !== user.id)
      return fail(403, "Only the organiser can edit this plan.");
    if (!["Draft", "Changes requested"].includes(plan.status))
      return fail(409, "This plan is no longer editable.");
    if (input.revision !== row.revision)
      return fail(409, "This plan changed elsewhere. Refresh before editing.");
    const { revision: _revision, submit, costs, itinerary, ...fields } = input;
    const validated = validDetails(fields, user, plan);
    let proposal =
      fields.experienceId === "researched" ? plan.proposal : undefined;
    if (costs && !proposal)
      return fail(
        400,
        "Custom costs are only available on a researched draft.",
      );
    if (itinerary && !proposal)
      return fail(
        400,
        "Custom itinerary is only available on a researched draft.",
      );
    if (proposal && costs) {
      const changed =
        JSON.stringify(costs) !==
        JSON.stringify(
          proposal.costs.map(({ label, amount, unit }) => ({
            label,
            amount,
            unit,
          })),
        );
      proposal = {
        ...proposal,
        organiserEdited: proposal.organiserEdited || changed,
        costs: costs.map((line, index) => {
          const prior = proposal!.costs[index];
          return prior &&
            prior.label === line.label &&
            prior.amount === line.amount &&
            prior.unit === line.unit
            ? prior
            : { ...line, basis: "estimate" as const };
        }),
      };
    }
    if (proposal) {
      const rows = (itinerary ?? proposal.itinerary).map((item, index) => ({
        ...item,
        time: index === 0 ? validated.time : item.time,
      }));
      if (
        rows.some(
          (item, index) => index > 0 && item.time < rows[index - 1].time,
        )
      )
        return fail(400, "Keep itinerary times in chronological order.");
      proposal = {
        ...proposal,
        organiserEdited:
          proposal.organiserEdited ||
          JSON.stringify(rows) !== JSON.stringify(proposal.itinerary),
        itinerary: rows,
        openQuestions: proposal.openQuestions.map((question) =>
          question ===
          `Confirm availability for ${plan.people} people on ${plan.date}.`
            ? `Confirm availability for ${validated.people} people on ${validated.date}.`
            : question,
        ),
      };
    }
    const estimate = proposal
      ? costTotal(proposal.costs, validated.people)
      : validated.unitPrice * validated.people;
    if (estimate <= 0 || estimate > 100000000)
      return fail(
        400,
        "Estimate must be positive and no more than 100,000,000 NGN.",
      );
    if (submit && estimate > validated.budget)
      return fail(400, "The estimate is above your budget.");
    return write(
      {
        ...plan,
        ...validated,
        proposal,
        unitPrice: proposal ? estimate / validated.people : validated.unitPrice,
        status: submit ? "Awaiting approval" : "Draft",
        going: plan.going.filter((id) => validated.attendees.includes(id)),
        declined: (plan.declined ?? []).filter((id) =>
          validated.attendees.includes(id),
        ),
        events: [
          ...(plan.events ?? []),
          nowEvent(
            submit
              ? `${user.name} sent the plan for approval.`
              : `${user.name} saved the draft.`,
          ),
        ],
      },
      user.team_id,
      input.revision,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/action",
    async (request) => {
      const { user } = authenticate(request, true);
      const input = z
        .object({
          action: z.enum(["approve", "request-changes", "cancel", "settle"]),
          revision: z.number().int().positive(),
          note: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(request.body);
      const { plan, row } = planFor(request.params.id, user);
      if (row.revision !== input.revision)
        return fail(
          409,
          "This plan changed elsewhere. Refresh before taking action.",
        );
      let next = { ...plan },
        message = "";
      if (input.action === "approve" || input.action === "request-changes") {
        if (user.role !== "manager" || row.creator_id === user.id)
          return fail(403, "A different manager must review this plan.");
        if (plan.status !== "Awaiting approval")
          return fail(409, "This plan is not awaiting approval.");
        if (input.action === "approve") {
          if (
            (plan.proposal
              ? costTotal(plan.proposal.costs, plan.people)
              : (plan.unitPrice ??
                  experiences.find((item) => item.id === plan.experienceId)!
                    .price) * plan.people) > plan.budget
          )
            return fail(400, "An over-budget plan cannot be approved.");
          if (outingStart(plan).getTime() <= Date.now())
            return fail(400, "Request a new date before approving this plan.");
          next.status = "Approved";
          message = `${user.name} approved the plan.${plan.emailGuests ? " Email invitations and reminders follow each guest's notification preferences." : " Guest email is turned off for this plan."}`;
        } else {
          if (!input.note)
            return fail(400, "Explain what the organiser needs to change.");
          next.status = "Changes requested";
          next.reviewNote = input.note;
          message = `${user.name} requested changes: ${input.note}`;
        }
      } else if (input.action === "cancel") {
        if (row.creator_id !== user.id && user.role !== "manager")
          return fail(
            403,
            "Only the organiser or a manager can cancel this outing.",
          );
        if (plan.status === "Cancelled" || plan.settledAt)
          return fail(409, "This outing is already closed.");
        next.status = "Cancelled";
        message = `${user.name} cancelled the outing.`;
      } else {
        if (user.role !== "manager")
          return fail(403, "Only a manager can settle an outing.");
        if (
          plan.status !== "Approved" ||
          plan.settledAt ||
          plan.date >= today()
        )
          return fail(409, "Only a past approved outing can be settled.");
        next.settledAt = new Date().toISOString();
        message = `${user.name} marked expense recording complete.`;
      }
      next = { ...next, events: [...(plan.events ?? []), nowEvent(message)] };
      return write(next, user.team_id, input.revision);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/plans/:id/rsvp",
    async (request) => {
      const { user } = authenticate(request, true);
      const input = z
        .object({ going: z.boolean(), revision: z.number().int().positive() })
        .strict()
        .parse(request.body);
      const { plan, row } = planFor(request.params.id, user);
      if (row.revision !== input.revision)
        return fail(
          409,
          "This plan changed elsewhere. Refresh before responding.",
        );
      if (plan.status !== "Approved" || plan.settledAt || plan.date < today())
        return fail(409, "RSVPs are closed for this outing.");
      if (!plan.attendees.includes(user.id))
        return fail(403, "You are not on this outing’s guest list.");
      if (
        input.going
          ? plan.going.includes(user.id)
          : plan.declined?.includes(user.id)
      )
        return plan;
      return write(
        {
          ...plan,
          going: [
            ...plan.going.filter((id) => id !== user.id),
            ...(input.going ? [user.id] : []),
          ],
          declined: [
            ...(plan.declined ?? []).filter((id) => id !== user.id),
            ...(!input.going ? [user.id] : []),
          ],
          events: [
            ...(plan.events ?? []),
            nowEvent(
              `${user.name} ${input.going ? "is going." : "can’t make it."}`,
            ),
          ],
        },
        user.team_id,
        input.revision,
      );
    },
  );
  app.post("/api/expenses", async (request, reply) => {
    const { user } = authenticate(request, true);
    const input = z
      .object({
        planId: text(80),
        description: text(100),
        amount: z.number().int().min(1).max(100000000),
        date: dateSchema,
        payer: text(80),
        category: z.enum(["Food & drinks", "Activity", "Transport", "Other"]),
        requestId: z.uuid().optional(),
      })
      .strict()
      .parse(request.body);
    return store.transaction(() => {
      const { requestId, ...fields } = input;
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(fields))
        .digest("hex");
      if (requestId) {
        const old = store.db
          .prepare(
            "SELECT expense_id,payload_hash FROM expense_requests WHERE user_id=? AND request_id=?",
          )
          .get(user.id, requestId) as
          { expense_id: string; payload_hash: string } | undefined;
        if (old) {
          if (old.payload_hash !== fingerprint)
            return fail(
              409,
              "That expense request was already used with different details. Refresh your records before retrying.",
            );
          const existing = store.db
            .prepare("SELECT data FROM expenses WHERE id=? AND team_id=?")
            .get(old.expense_id, user.team_id) as { data: string } | undefined;
          if (existing) return JSON.parse(existing.data);
          return fail(409, "The earlier expense is no longer available.");
        }
      }
      const { plan, row } = planFor(input.planId, user);
      if (plan.status !== "Approved" || plan.settledAt)
        return fail(
          409,
          "Record expenses against an approved, unsettled outing.",
        );
      if (
        user.role !== "manager" &&
        row.creator_id !== user.id &&
        !plan.attendees.includes(user.id)
      )
        return fail(403, "You are not part of this outing.");
      if (input.date > today())
        return fail(400, "Expense dates cannot be in the future.");
      const payer = store
        .members(user.team_id)
        .find((member) => member.id === input.payer);
      if (!payer) return fail(400, "Choose a payer from this team.");
      if (user.role !== "manager" && payer.id !== user.id)
        return fail(403, "Employees can record only their own spending.");
      const expense = {
        ...fields,
        payer: payer.name,
        payerId: payer.id,
        createdBy: user.id,
        id: randomUUID(),
      };
      store.db
        .prepare(
          "INSERT INTO expenses(id,team_id,plan_id,created_by,data) VALUES(?,?,?,?,?)",
        )
        .run(
          expense.id,
          user.team_id,
          plan.id,
          user.id,
          JSON.stringify(expense),
        );
      if (requestId)
        store.db
          .prepare(
            "INSERT INTO expense_requests(user_id,request_id,expense_id,payload_hash) VALUES(?,?,?,?)",
          )
          .run(user.id, requestId, expense.id, fingerprint);
      write(
        {
          ...plan,
          events: [
            ...(plan.events ?? []),
            nowEvent(
              `${user.name} recorded ${money(input.amount)} for ${input.description}.`,
            ),
          ],
        },
        user.team_id,
        row.revision,
      );
      return reply.code(201).send(expense);
    });
  });
  app.put("/api/preferences", async (request) => {
    const { user } = authenticate(request, true);
    const input = z
      .object({ preference: z.enum(preferences) })
      .strict()
      .parse(request.body);
    store.db
      .prepare("UPDATE users SET preference = ? WHERE id = ?")
      .run(input.preference, user.id);
    return { ok: true };
  });
  app.put<{ Params: { id: string } }>("/api/saved/:id", async (request) => {
    const { user } = authenticate(request, true);
    const input = z.object({ saved: z.boolean() }).strict().parse(request.body);
    if (!experiences.some((item) => item.id === request.params.id))
      return fail(400, "Experience not found.");
    if (input.saved)
      store.db
        .prepare(
          "INSERT OR IGNORE INTO saved_ideas(user_id,experience_id) VALUES(?,?)",
        )
        .run(user.id, request.params.id);
    else
      store.db
        .prepare(
          "DELETE FROM saved_ideas WHERE user_id = ? AND experience_id = ?",
        )
        .run(user.id, request.params.id);
    return { ok: true };
  });
  if (options.serveStatic)
    await app.register(staticFiles, {
      root: resolve("dist"),
      index: "index.html",
    });
  await app.ready();
  return app;
}
