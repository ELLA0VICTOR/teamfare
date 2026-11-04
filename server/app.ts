import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { experiences, money } from "../src/data.ts";
import type { Plan } from "../src/data.ts";
import { Store } from "./store.ts";
import type { UserRow } from "./store.ts";
import {
  digest,
  hashPassword,
  sessionCookie,
  token,
  verifyPassword,
} from "./auth.ts";

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
const account = z.object({
  name: text(80),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});
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
  })
  .strict();
const preferences = [
  "No preference",
  "Vegetarian options",
  "Vegan options",
  "Halal options",
] as const;
type SessionRow = { user_id: string; csrf: string; expires: number };
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
  } = {},
) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin = new URL(
    options.origin ?? process.env.APP_ORIGIN ?? "http://localhost:5173",
  ).origin;
  if (production && !origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  const store = new Store(
    options.databasePath ??
      process.env.DATABASE_PATH ??
      "./data/teamfare.sqlite",
  );
  const app = Fastify({
    bodyLimit: 32 * 1024,
    logger: false,
    trustProxy: process.env.TRUST_PROXY === "1" ? (_address: string, hop: number) => hop === 0 : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  const authRate = {
    rateLimit: {
      max: options.authLimit ?? 10,
      timeWindow: "10 minutes",
      groupId: "account-access",
    },
  };
  const dummyPassword = await hashPassword(token());
  app.addHook("onClose", () => store.close());
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
      .prepare("SELECT user_id,csrf,expires FROM sessions WHERE hash = ?")
      .get(digest(value)) as SessionRow | undefined;
    if (!session || session.expires <= Date.now())
      return fail(401, "Your session has expired. Sign in again.");
    const user = store.user(session.user_id);
    if (!user) return fail(401, "Sign in to continue.");
    if (mutation && request.headers["x-csrf-token"] !== session.csrf)
      return fail(403, "Refresh the page and try again.");
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
        "INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)",
      )
      .run(digest(value), user.id, csrf, Date.now() + 7 * 86400000);
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
  function validDetails(input: z.infer<typeof details>, user: UserRow) {
    const experience = experiences.find(
      (item) => item.id === input.experienceId,
    );
    if (!experience) return fail(400, "Choose a valid experience.");
    if (input.people > experience.capacity)
      return fail(
        400,
        `This experience supports up to ${experience.capacity} people.`,
      );
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
    return { ...input, attendees, unitPrice: experience.price };
  }
  function write(plan: Plan, teamId: string, revision: number) {
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
    return { ...plan, revision: revision + 1 };
  }
  app.get("/api/health", async () => ({ ok: true }));
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
  app.post(
    "/api/auth/register",
    { config: authRate },
    async (request, reply) => {
      const input = account
        .extend({ teamName: text(80) })
        .strict()
        .parse(request.body);
      const password = await hashPassword(input.password);
      const userId = randomUUID(),
        teamId = randomUUID();
      store.transaction(() => {
        if (store.userByEmail(input.email))
          fail(
            409,
            "An account already exists for this email. Sign in instead.",
          );
        store.db
          .prepare("INSERT INTO teams(id,name,created_at) VALUES(?,?,?)")
          .run(teamId, input.teamName, new Date().toISOString());
        store.db
          .prepare(
            "INSERT INTO users(id,team_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)",
          )
          .run(userId, teamId, input.name, input.email, password, "manager");
      });
      reply.code(201);
      return session(store.user(userId)!, reply);
    },
  );
  app.post("/api/auth/login", { config: authRate }, async (request, reply) => {
    const input = z
      .object({
        email: z.email().transform((value) => value.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(request.body);
    const user = store.userByEmail(input.email);
    const verified = await verifyPassword(
      input.password,
      user?.password_hash ?? dummyPassword,
    );
    if (!user || !verified)
      return fail(401, "The email or password is incorrect.");
    const previous = request.cookies[sessionCookie];
    if (previous)
      store.db
        .prepare("DELETE FROM sessions WHERE hash = ?")
        .run(digest(previous));
    return session(user, reply);
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
  app.post("/api/auth/join", { config: authRate }, async (request, reply) => {
    const input = account
      .extend({ inviteCode: z.string().min(20).max(128) })
      .strict()
      .parse(request.body);
    const password = await hashPassword(input.password),
      id = randomUUID();
    store.transaction(() => {
      const invite = store.db
        .prepare(
          "SELECT id,team_id,role,expires,used_by FROM invites WHERE token_hash = ?",
        )
        .get(digest(input.inviteCode)) as
        | {
            id: string;
            team_id: string;
            role: string;
            expires: number;
            used_by: string | null;
          }
        | undefined;
      if (!invite || invite.used_by || invite.expires <= Date.now())
        return fail(
          400,
          "This invitation is invalid, expired, or already used.",
        );
      if (store.userByEmail(input.email))
        fail(409, "An account already exists for this email. Sign in instead.");
      store.db
        .prepare(
          "INSERT INTO users(id,team_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id,
          invite.team_id,
          input.name,
          input.email,
          password,
          invite.role,
        );
      store.db
        .prepare(
          "UPDATE invites SET used_by = ? WHERE id = ? AND used_by IS NULL",
        )
        .run(id, invite.id);
    });
    reply.code(201);
    return session(store.user(id)!, reply);
  });
  app.get("/api/state", async (request) => snapshot(authenticate(request)));
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
      })
      .parse(request.body);
    if (row.creator_id !== user.id)
      return fail(403, "Only the organiser can edit this plan.");
    if (!["Draft", "Changes requested"].includes(plan.status))
      return fail(409, "This plan is no longer editable.");
    if (input.revision !== row.revision)
      return fail(409, "This plan changed elsewhere. Refresh before editing.");
    const { revision: _revision, submit, ...fields } = input;
    const validated = validDetails(fields, user);
    if (submit && validated.unitPrice * validated.people > validated.budget)
      return fail(400, "The estimate is above your budget.");
    return write(
      {
        ...plan,
        ...validated,
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
            (plan.unitPrice ??
              experiences.find((item) => item.id === plan.experienceId)!
                .price) *
              plan.people >
            plan.budget
          )
            return fail(400, "An over-budget plan cannot be approved.");
          if (plan.date < today())
            return fail(400, "Request a new date before approving this plan.");
          next.status = "Approved";
          message = `${user.name} approved the plan. No invitations were sent.`;
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
      })
      .strict()
      .parse(request.body);
    return store.transaction(() => {
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
        ...input,
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
