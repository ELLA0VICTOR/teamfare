import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Store, UserRow } from "./store.ts";
import {
  digest,
  hashPassword,
  sessionCookie,
  token,
  verifyPassword,
} from "./auth.ts";
import { MailError, mailSetup, resendMailer } from "./mail.ts";
import type { AuthMailer } from "./mail.ts";
import type { AuthChallenge } from "../src/identity.ts";

export class IdentityError extends Error {
  statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.statusCode = status;
  }
}
const fail = (status: number, message: string): never => {
  throw new IdentityError(status, message);
};
const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());
const password = z.string().min(15, "Use at least 15 characters.").max(128);
const newPassword = z
  .object({ password, confirmPassword: z.string().max(128) })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
const startFields = {
  name: z.string().trim().min(1).max(80),
  email,
  password,
  confirmPassword: z.string().max(128),
};
type Purpose = AuthChallenge["purpose"];
type ChallengeRow = {
  id: string;
  purpose: Purpose;
  email: string;
  user_id: string | null;
  code_hash: string;
  payload: string;
  expires: number;
  resend_at: number;
  attempts: number;
  sends: number;
  state: string;
  consumed_at: number | null;
};
type Payload = {
  name?: string;
  teamName?: string;
  inviteHash?: string;
  passwordHash?: string;
  version?: number;
  existing?: boolean;
};
const lifetime = 10 * 60 * 1000,
  cooldown = 60 * 1000;
const invalid =
  "That code is invalid, expired, or already used. Request a new code if needed.";
const resetMessage =
  "If an account exists for that email, a reset code will arrive shortly. Check your inbox and spam folder.";

export function registerIdentity(
  app: FastifyInstance,
  store: Store,
  options: {
    production: boolean;
    authLimit: number;
    mailer?: AuthMailer;
    secret?: string;
    authenticate: (
      request: FastifyRequest,
      mutation?: boolean,
    ) => { user: UserRow; csrf: string };
    session: (user: UserRow, reply: FastifyReply) => unknown;
    dummyPassword: string;
  },
) {
  if (options.production && (options.mailer || options.secret))
    throw new Error(
      "Injected identity test settings are not allowed in production.",
    );
  const secret = options.secret ?? process.env.AUTH_SECRET ?? "";
  if (options.production && secret.length < 32)
    throw new Error(
      "Set AUTH_SECRET to a random secret of at least 32 characters before production startup.",
    );
  const mailer = options.mailer ?? resendMailer();
  const jobs = new Set<Promise<void>>();
  app.addHook("onClose", async () => {
    await Promise.allSettled([...jobs]);
  });
  function ready() {
    if (secret.length < 32 || (!options.mailer && !mailSetup().ready))
      fail(
        503,
        "Account email verification is not configured yet. Please contact the team administrator; sample browsing is still available.",
      );
  }
  function audit(event: string, userId?: string) {
    store.db
      .prepare("INSERT INTO auth_audit(event,user_id,at) VALUES(?,?,?)")
      .run(event, userId ?? null, Date.now());
  }
  function limit(key: string, max: number, window: number) {
    const now = Date.now();
    store.transaction(() => {
      store.db.prepare("DELETE FROM auth_limits WHERE expires<=?").run(now);
      const row = store.db
        .prepare("SELECT count FROM auth_limits WHERE bucket=?")
        .get(key) as { count: number } | undefined;
      if (row && row.count >= max)
        fail(
          429,
          "Too many account attempts. Please wait before trying again.",
        );
      store.db
        .prepare(
          "INSERT INTO auth_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
        )
        .run(key, now + window);
    });
  }
  function codeHash(id: string, code: string) {
    return createHmac("sha256", secret)
      .update(id + ":" + code)
      .digest("hex");
  }
  function view(row: ChallengeRow): AuthChallenge {
    return {
      challengeId: row.id,
      purpose: row.purpose,
      email: row.email,
      expiresAt: new Date(row.expires).toISOString(),
      resendAt: new Date(row.resend_at).toISOString(),
      message:
        row.purpose === "reset"
          ? resetMessage
          : "Enter the six-digit code sent to your email. It expires in 10 minutes.",
    };
  }
  function rowFor(id: string) {
    return store.db
      .prepare("SELECT * FROM auth_challenges WHERE id=?")
      .get(id) as ChallengeRow | undefined;
  }
  function fresh(id: string) {
    const row = rowFor(id);
    if (
      !row ||
      row.consumed_at ||
      row.expires <= Date.now() ||
      row.attempts >= 5
    )
      return fail(400, invalid);
    return row;
  }
  function validCode(id: string, code: string) {
    const row = fresh(id);
    if (row.state !== "ready")
      return fail(
        400,
        "A usable code has not arrived yet. Check your inbox or request a new code.",
      );
    const expected = Buffer.from(row.code_hash, "hex"),
      actual = Buffer.from(codeHash(id, code), "hex");
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      store.db
        .prepare("UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?")
        .run(id);
      audit("code_rejected", row.user_id ?? undefined);
      return fail(400, invalid);
    }
    return row;
  }
  function invalidate(user: UserRow) {
    store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    store.db
      .prepare(
        "UPDATE auth_challenges SET consumed_at=? WHERE (user_id=? OR email=?) AND consumed_at IS NULL",
      )
      .run(Date.now(), user.id, user.email);
  }
  function checkVersion(row: ChallengeRow, payload: Payload) {
    const user = row.user_id ? store.user(row.user_id) : undefined;
    if (!user || user.auth_version !== payload.version)
      return fail(400, invalid);
    return user;
  }
  function consume(row: ChallengeRow) {
    const changed = store.db
      .prepare(
        "UPDATE auth_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND state='ready' AND code_hash=? AND expires>? AND attempts<5",
      )
      .run(Date.now(), row.id, row.code_hash, Date.now());
    if (changed.changes !== 1) fail(400, invalid);
  }
  function notification(user: UserRow, kind: string) {
    store.db
      .prepare(
        "INSERT INTO auth_notifications(id,user_id,kind,created_at) VALUES(?,?,?,?)",
      )
      .run(randomUUID(), user.id, kind, Date.now());
  }
  let flushing = false;
  async function flushNotifications() {
    if (
      flushing ||
      secret.length < 32 ||
      (!options.mailer && !mailSetup().ready)
    )
      return;
    flushing = true;
    const work = (async () => {
      const rows = store.db
        .prepare(
          "SELECT n.id,n.kind,u.email FROM auth_notifications n JOIN users u ON u.id=n.user_id WHERE n.sent_at IS NULL AND n.attempts<3 AND n.retry_at<=? LIMIT 20",
        )
        .all(Date.now()) as { id: string; kind: string; email: string }[];
      for (const row of rows) {
        try {
          await mailer.send({
            id: row.id,
            to: row.email,
            subject: "Your Teamfare password was changed",
            text: `Your Teamfare password was changed (${row.kind}). All previous sessions have been signed out. If this was not you, use Forgot password on Teamfare immediately and contact your team administrator. We will never ask you to email us your password or verification codes.`,
          });
          store.db
            .prepare("UPDATE auth_notifications SET sent_at=? WHERE id=?")
            .run(Date.now(), row.id);
        } catch {
          store.db
            .prepare(
              "UPDATE auth_notifications SET attempts=attempts+1,retry_at=? WHERE id=?",
            )
            .run(Date.now() + 60000, row.id);
        }
      }
    })();
    jobs.add(work);
    try {
      await work;
    } finally {
      jobs.delete(work);
      flushing = false;
    }
  }
  const notificationTimer = setInterval(() => void flushNotifications(), 60000);
  notificationTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(notificationTimer);
  });
  void flushNotifications();
  async function deliver(row: ChallengeRow, code: string) {
    try {
      // Unknown reset recipients receive the same browser response, but no email.
      if (row.purpose !== "reset" || row.user_id) {
        const label =
          row.purpose === "signup"
            ? "verify your email"
            : row.purpose === "login"
              ? "finish signing in"
              : row.purpose === "reset"
                ? "reset your password"
                : "confirm your password change";
        await mailer.send({
          id: `auth/${row.id}/${row.sends}`,
          to: row.email,
          subject: "Your Teamfare verification code",
          text: `Your Teamfare code to ${label} is ${code}.\n\nThis code expires in 10 minutes and can be used once. Enter it only in Teamfare. Never share it with anyone. If you did not request this, ignore this email; no account access or password change has been granted.`,
        });
      }
      store.db
        .prepare(
          "UPDATE auth_challenges SET state='ready' WHERE id=? AND code_hash=? AND consumed_at IS NULL",
        )
        .run(row.id, row.code_hash);
    } catch (error) {
      store.db
        .prepare(
          "UPDATE auth_challenges SET state='failed' WHERE id=? AND code_hash=?",
        )
        .run(row.id, row.code_hash);
      throw error instanceof MailError
        ? error
        : new MailError(
            "The email service could not send your code. Try again later.",
          );
    }
  }
  async function issue(
    purpose: Purpose,
    address: string,
    user: UserRow | undefined,
    payload: Payload,
    background = false,
  ) {
    ready();
    limit("send:" + digest(address), 5, 3600000);
    const now = Date.now(),
      id = token(),
      code = randomInt(0, 1000000).toString().padStart(6, "0");
    store.db
      .prepare("DELETE FROM auth_challenges WHERE expires<?")
      .run(now - 86400000);
    const row: ChallengeRow = {
      id,
      purpose,
      email: address,
      user_id: user?.id ?? null,
      code_hash: codeHash(id, code),
      payload: JSON.stringify(payload),
      expires: now + lifetime,
      resend_at: now + cooldown,
      attempts: 0,
      sends: 1,
      state: "sending",
      consumed_at: null,
    };
    store.db
      .prepare(
        "INSERT INTO auth_challenges(id,purpose,email,user_id,code_hash,payload,expires,resend_at,attempts,sends,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        purpose,
        address,
        row.user_id,
        row.code_hash,
        row.payload,
        row.expires,
        row.resend_at,
        0,
        1,
        "sending",
      );
    const sending = deliver(row, code);
    if (background) {
      const safe = sending.catch(() => {});
      jobs.add(safe);
      void safe.finally(() => jobs.delete(safe));
    } else await sending;
    return view(row);
  }
  const authRate = {
    rateLimit: {
      max: options.authLimit,
      timeWindow: "10 minutes",
      groupId: "account-access",
    },
  };
  const codeRate = {
    rateLimit: { max: 30, timeWindow: "10 minutes", groupId: "account-codes" },
  };
  app.get("/api/auth/config", () => ({
    ready: secret.length >= 32 && (!!options.mailer || mailSetup().ready),
  }));
  app.post(
    "/api/auth/register",
    { config: authRate },
    async (request, reply) => {
      ready();
      const input = z
        .object({ ...startFields, teamName: z.string().trim().min(1).max(80) })
        .strict()
        .refine((v) => v.password === v.confirmPassword, {
          message: "Passwords do not match.",
        })
        .parse(request.body);
      const user = store.userByEmail(input.email);
      const passwordHash = await hashPassword(input.password);
      const challenge = await issue("signup", input.email, user, {
        name: input.name,
        teamName: input.teamName,
        passwordHash,
        existing: !!user,
      });
      return reply.code(202).send(challenge);
    },
  );
  app.post("/api/auth/join", { config: authRate }, async (request, reply) => {
    ready();
    const input = z
      .object({ ...startFields, inviteCode: z.string().min(20).max(128) })
      .strict()
      .refine((v) => v.password === v.confirmPassword, {
        message: "Passwords do not match.",
      })
      .parse(request.body);
    const inviteHash = digest(input.inviteCode);
    const invite = store.db
      .prepare(
        "SELECT id FROM invites WHERE token_hash=? AND used_by IS NULL AND expires>?",
      )
      .get(inviteHash, Date.now());
    if (!invite)
      return fail(400, "This invitation is invalid, expired, or already used.");
    const user = store.userByEmail(input.email);
    const challenge = await issue("signup", input.email, user, {
      name: input.name,
      inviteHash,
      passwordHash: await hashPassword(input.password),
      existing: !!user,
    });
    return reply.code(202).send(challenge);
  });
  app.post("/api/auth/login", { config: authRate }, async (request, reply) => {
    ready();
    const input = z
      .object({ email, password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    limit("login:" + digest(input.email), 20, 15 * 60000);
    const user = store.userByEmail(input.email);
    const verified = await verifyPassword(
      input.password,
      user?.password_hash ?? options.dummyPassword,
    );
    if (
      !user ||
      !verified ||
      store.user(user.id)?.auth_version !== user.auth_version
    ) {
      audit("login_rejected");
      return fail(401, "The email or password is incorrect.");
    }
    const challenge = await issue("login", input.email, user, {
      version: user.auth_version,
    });
    return reply.code(202).send(challenge);
  });
  app.post(
    "/api/auth/forgot-password",
    { config: authRate },
    async (request, reply) => {
      ready();
      const input = z.object({ email }).strict().parse(request.body);
      const user = store.userByEmail(input.email);
      const challenge = await issue(
        "reset",
        input.email,
        user,
        { version: user?.auth_version },
        true,
      );
      return reply.code(202).send(challenge);
    },
  );
  app.post("/api/auth/resend", { config: codeRate }, async (request) => {
    ready();
    const { challengeId } = z
      .object({ challengeId: z.string().min(20).max(128) })
      .strict()
      .parse(request.body);
    const row = fresh(challengeId);
    if (row.resend_at > Date.now())
      return fail(429, "Please wait one minute between code requests.");
    if (row.sends >= 3)
      return fail(
        429,
        "This request has reached its resend limit. Start again after it expires.",
      );
    limit("send:" + digest(row.email), 5, 3600000);
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    row.code_hash = codeHash(row.id, code);
    row.sends++;
    row.resend_at = Date.now() + cooldown;
    row.state = "sending";
    store.db
      .prepare(
        "UPDATE auth_challenges SET code_hash=?,sends=?,resend_at=?,state='sending' WHERE id=?",
      )
      .run(row.code_hash, row.sends, row.resend_at, row.id);
    const sending = deliver(row, code);
    if (row.purpose === "reset") {
      const safe = sending.catch(() => {});
      jobs.add(safe);
      void safe.finally(() => jobs.delete(safe));
    } else await sending;
    return view(row);
  });
  const proof = z.object({
    challengeId: z.string().min(20).max(128),
    code: z.string().regex(/^\d{6}$/, "Enter the six-digit code."),
  });
  app.post("/api/auth/verify", { config: codeRate }, async (request, reply) => {
    const input = proof.strict().parse(request.body),
      row = validCode(input.challengeId, input.code),
      payload = JSON.parse(row.payload) as Payload;
    if (row.purpose === "reset")
      return fail(400, "Use the password reset form for this code.");
    if (row.purpose === "change_password") {
      const auth = options.authenticate(request, true);
      if (auth.user.id !== row.user_id)
        return fail(403, "This password change belongs to another account.");
      store.transaction(() => {
        const current = checkVersion(row, payload);
        consume(row);
        store.db
          .prepare(
            "UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?",
          )
          .run(payload.passwordHash!, current.id);
        invalidate(current);
        audit("password_changed", current.id);
        notification(current, "account settings");
        return current;
      });
      void flushNotifications();
      reply.clearCookie(sessionCookie, {
        path: "/",
        secure: options.production,
        httpOnly: true,
        sameSite: "lax",
      });
      return { passwordChanged: true };
    }
    const user = store.transaction(() => {
      consume(row);
      if (row.purpose === "login") {
        const current = checkVersion(row, payload);
        store.db
          .prepare(
            "UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?",
          )
          .run(new Date().toISOString(), current.id);
        audit("login_verified", current.id);
        return store.user(current.id)!;
      }
      if (payload.existing || store.userByEmail(row.email))
        return fail(
          409,
          "This email already has an account. Sign in or reset your password; this request has not changed it.",
        );
      const userId = randomUUID();
      let teamId: string,
        role: "employee" | "manager" = "manager";
      if (payload.inviteHash) {
        const invite = store.db
          .prepare(
            "SELECT id,team_id,role FROM invites WHERE token_hash=? AND used_by IS NULL AND expires>?",
          )
          .get(payload.inviteHash, Date.now()) as
          | { id: string; team_id: string; role: "employee" | "manager" }
          | undefined;
        if (!invite)
          return fail(
            400,
            "This invitation is invalid, expired, or already used. Ask your manager for another invitation.",
          );
        teamId = invite.team_id;
        role = invite.role;
      } else {
        teamId = randomUUID();
        store.db
          .prepare("INSERT INTO teams(id,name,created_at) VALUES(?,?,?)")
          .run(teamId, payload.teamName!, new Date().toISOString());
      }
      store.db
        .prepare(
          "INSERT INTO users(id,team_id,name,email,password_hash,role,email_verified_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          userId,
          teamId,
          payload.name!,
          row.email,
          payload.passwordHash!,
          role,
          new Date().toISOString(),
        );
      if (payload.inviteHash)
        store.db
          .prepare(
            "UPDATE invites SET used_by=? WHERE token_hash=? AND used_by IS NULL",
          )
          .run(userId, payload.inviteHash);
      store.db
        .prepare(
          "UPDATE auth_challenges SET consumed_at=? WHERE email=? AND consumed_at IS NULL",
        )
        .run(Date.now(), row.email);
      audit("signup_verified", userId);
      return store.user(userId)!;
    });
    const previous = request.cookies[sessionCookie];
    if (previous)
      store.db
        .prepare("DELETE FROM sessions WHERE hash=?")
        .run(digest(previous));
    return options.session(user, reply);
  });
  app.post(
    "/api/auth/reset-password",
    { config: codeRate },
    async (request) => {
      const input = proof
        .extend({ password, confirmPassword: z.string().max(128) })
        .strict()
        .refine((v) => v.password === v.confirmPassword, {
          message: "Passwords do not match.",
        })
        .parse(request.body);
      const row = validCode(input.challengeId, input.code);
      if (row.purpose !== "reset" || !row.user_id) return fail(400, invalid);
      const payload = JSON.parse(row.payload) as Payload;
      const passwordHash = await hashPassword(input.password);
      store.transaction(() => {
        const current = checkVersion(row, payload);
        consume(row);
        store.db
          .prepare(
            "UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?),auth_version=auth_version+1 WHERE id=?",
          )
          .run(passwordHash, new Date().toISOString(), current.id);
        invalidate(current);
        audit("password_reset", current.id);
        notification(current, "password recovery");
        return current;
      });
      void flushNotifications();
      return { passwordChanged: true };
    },
  );
  app.post(
    "/api/auth/change-password",
    { config: authRate },
    async (request, reply) => {
      ready();
      const { user } = options.authenticate(request, true);
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          ...newPassword.shape,
        })
        .strict()
        .refine((v) => v.password === v.confirmPassword, {
          message: "Passwords do not match.",
        })
        .parse(request.body);
      if (!(await verifyPassword(input.currentPassword, user.password_hash)))
        return fail(401, "Your current password is incorrect.");
      if (input.currentPassword === input.password)
        return fail(400, "Choose a different new password.");
      const challenge = await issue("change_password", user.email, user, {
        version: user.auth_version,
        passwordHash: await hashPassword(input.password),
      });
      return reply.code(202).send(challenge);
    },
  );
  app.post("/api/auth/logout-all", async (request, reply) => {
    const { user } = options.authenticate(request, true);
    store.transaction(() => {
      store.db
        .prepare("UPDATE users SET auth_version=auth_version+1 WHERE id=?")
        .run(user.id);
      invalidate(user);
      audit("sessions_revoked", user.id);
    });
    reply.clearCookie(sessionCookie, {
      path: "/",
      secure: options.production,
      httpOnly: true,
      sameSite: "lax",
    });
    return { ok: true };
  });
}
