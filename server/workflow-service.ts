import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { Store, UserRow } from "./store.ts";
import type { Plan } from "../src/data.ts";
import type { MailMessage, AuthMailer } from "./mail.ts";
import { mailSetup, resendMailer } from "./mail.ts";
import { calendarFile, outingStart } from "../src/workflows.ts";
import type { WorkflowEmail } from "../src/workflows.ts";

export class WorkflowError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
type Row = {
  id: string;
  team_id: string;
  plan_id: string | null;
  recipient_id: string | null;
  recipient_email: string;
  kind: string;
  payload: string;
  status: WorkflowEmail["status"];
  attempts: number;
  created_at: number;
  send_at: number;
  expires_at: number;
  accepted_at: number | null;
  error: string | null;
};
export class WorkflowService {
  readonly store: Store;
  readonly origin: string;
  private readonly key: Buffer;
  private readonly mailer: AuthMailer;
  private readonly configured: boolean;
  private timer?: ReturnType<typeof setInterval>;
  private working?: Promise<void>;
  private stopping = false;
  constructor(
    store: Store,
    origin: string,
    options: { mailer?: AuthMailer; secret: string; now?: () => number },
  ) {
    this.store = store;
    this.origin = origin;
    this.key = createHash("sha256")
      .update("teamfare-workflow-outbox-v1\0" + options.secret)
      .digest();
    this.mailer = options.mailer ?? resendMailer();
    this.configured =
      options.secret.length >= 32 && (!!options.mailer || mailSetup().ready);
    this.now = options.now ?? Date.now;
  }
  private readonly now: () => number;
  private seal(message: MailMessage) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(message), "utf8"),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), bytes]
      .map((b) => b.toString("base64"))
      .join(".");
  }
  private open(payload: string): MailMessage {
    const parts = payload.split(".").map((p) => Buffer.from(p, "base64"));
    if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16)
      throw new Error("Invalid encrypted job");
    const decipher = createDecipheriv("aes-256-gcm", this.key, parts[0]);
    decipher.setAuthTag(parts[1]);
    return JSON.parse(
      Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString(
        "utf8",
      ),
    ) as MailMessage;
  }
  enqueue(input: {
    teamId: string;
    planId?: string;
    recipient?: UserRow;
    to?: string;
    kind: string;
    dedupe: string;
    subject: string;
    text: string;
    attachments?: MailMessage["attachments"];
    at?: number;
    expires?: number;
    requireOptIn?: boolean;
  }) {
    const old = this.store.db
      .prepare("SELECT id FROM workflow_emails WHERE dedupe=?")
      .get(input.dedupe) as { id: string } | undefined;
    if (old) return old.id;
    const now = this.now(),
      id = randomUUID(),
      recipient = input.recipient,
      to = recipient?.email ?? input.to ?? "";
    const suppressed =
      !to ||
      to.endsWith(".invalid") ||
      (recipient &&
        (this.store.isJudge(recipient) ||
          !recipient.email_verified_at ||
          (input.requireOptIn !== false && !recipient.outing_emails)));
    const count = this.store.db
      .prepare(
        "SELECT count(*) AS n FROM workflow_emails WHERE recipient_email=? AND created_at>=? AND status<>'suppressed'",
      )
      .get(to, now - 86400000) as { n: number };
    const status = suppressed
      ? "suppressed"
      : !this.configured || count.n >= 30
        ? "failed"
        : "pending";
    const error = suppressed
      ? "Email notifications are disabled or this is a public judge account."
      : !this.configured
        ? "Email delivery is not configured."
        : count.n >= 30
          ? "Daily recipient notification limit reached."
          : null;
    const message: MailMessage = {
      id: "workflow/" + id,
      to,
      subject: input.subject.replace(/[\r\n]/g, " ").slice(0, 180),
      text: input.text,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    };
    this.store.db
      .prepare(
        "INSERT INTO workflow_emails(id,dedupe,team_id,plan_id,recipient_id,recipient_email,kind,payload,status,created_at,send_at,expires_at,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        input.dedupe,
        input.teamId,
        input.planId ?? null,
        recipient?.id ?? null,
        to,
        input.kind,
        this.seal(message),
        status,
        now,
        input.at ?? now,
        input.expires ?? now + 22 * 3600000,
        error,
      );
    return id;
  }
  planChanged(before: Plan, next: Plan, teamId: string) {
    if (next.settledAt && !before.settledAt) {
      this.store.db
        .prepare(
          "UPDATE workflow_emails SET status='cancelled',error='The outing was settled.' WHERE plan_id=? AND status='pending' AND kind IN ('invitation','reminder','availability')",
        )
        .run(next.id);
      return;
    }
    if (before.status === next.status) return;
    const link = this.origin + "/#plan/" + encodeURIComponent(next.id);
    const latest = next.events?.at(-1)?.text ?? "The plan was updated.";
    const text = `${next.title}\n${next.date} at ${next.time} (Africa/Lagos)\n${next.location ?? next.proposal?.location ?? ""}\n\n${latest}\n\nOpen Teamfare to review the current plan and RSVP: ${link}\n\nThis is an outing coordination message, not a confirmed venue booking. Manage outing email preferences in your Teamfare account.`;
    if (["Cancelled", "Changes requested", "Draft"].includes(next.status))
      this.store.db
        .prepare(
          "UPDATE workflow_emails SET status='cancelled',error='The plan changed before this message was sent.' WHERE plan_id=? AND status='pending' AND kind IN ('invitation','reminder','review','availability')",
        )
        .run(next.id);
    if (next.status === "Approved") {
      this.store.db
        .prepare("UPDATE availability_polls SET closed=1 WHERE plan_id=?")
        .run(next.id);
      this.invite(next, teamId, String(next.revision));
    } else if (next.status === "Awaiting approval") {
      const managers = this.store.db
        .prepare(
          "SELECT * FROM users WHERE team_id=? AND role='manager' AND id<>?",
        )
        .all(teamId, next.createdBy ?? "") as UserRow[];
      for (const recipient of managers)
        this.enqueue({
          teamId,
          planId: next.id,
          recipient,
          kind: "review",
          dedupe: `review/${next.id}/${next.revision}/${recipient.id}`,
          subject: "For your review: " + next.title,
          text,
        });
    } else if (next.status === "Changes requested" && next.createdBy) {
      const recipient = this.store.user(next.createdBy);
      if (recipient)
        this.enqueue({
          teamId,
          planId: next.id,
          recipient,
          kind: "changes",
          dedupe: `changes/${next.id}/${next.revision}`,
          subject: "Changes requested: " + next.title,
          text,
        });
    } else if (next.status === "Cancelled" && next.emailGuests) {
      for (const id of next.attendees) {
        const recipient = this.store.user(id);
        if (recipient?.team_id === teamId)
          this.enqueue({
            teamId,
            planId: next.id,
            recipient,
            kind: "cancellation",
            dedupe: `cancellation/${next.id}/${next.revision}/${id}`,
            subject: "Cancelled: " + next.title,
            text,
            attachments: [
              {
                filename: "teamfare-cancelled.ics",
                content: Buffer.from(calendarFile(next, this.origin)).toString(
                  "base64",
                ),
              },
            ],
          });
      }
    }
  }
  list(teamId: string, user: UserRow, plan?: Plan): WorkflowEmail[] {
    const all = user.role === "manager" || plan?.createdBy === user.id;
    const rows = this.store.db
      .prepare(
        "SELECT id,kind,recipient_email,status,attempts,send_at,accepted_at,error FROM workflow_emails WHERE team_id=? AND (? IS NULL OR plan_id=?) AND (?=1 OR recipient_id=?) ORDER BY created_at DESC LIMIT 100",
      )
      .all(
        teamId,
        plan?.id ?? null,
        plan?.id ?? null,
        all ? 1 : 0,
        user.id,
      ) as Row[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      recipient: r.recipient_email,
      status: r.status,
      attempts: r.attempts,
      scheduledAt: new Date(r.send_at).toISOString(),
      ...(r.accepted_at
        ? { acceptedAt: new Date(r.accepted_at).toISOString() }
        : {}),
      ...(r.error ? { error: r.error } : {}),
    }));
  }
  status(id: string) {
    return (
      (
        this.store.db
          .prepare("SELECT status FROM workflow_emails WHERE id=?")
          .get(id) as { status: string } | undefined
      )?.status ?? "failed"
    );
  }
  invite(plan: Plan, teamId: string, batch: string) {
    if (!plan.emailGuests) return;
    const start = outingStart(plan).getTime();
    const text = `${plan.title}\n${plan.date} at ${plan.time} (Africa/Lagos)\n${plan.location ?? plan.proposal?.location ?? ""}\n\nYour team outing was approved. RSVP and review current details: ${this.origin}/#plan/${encodeURIComponent(plan.id)}\n\nNo venue has been booked by Teamfare. Manage outing emails in your account preferences.`;
    for (const id of plan.attendees) {
      const recipient = this.store.user(id);
      if (!recipient || recipient.team_id !== teamId) continue;
      const common = {
        teamId,
        planId: plan.id,
        recipient,
        text,
        requireOptIn: true,
      };
      this.enqueue({
        ...common,
        kind: "invitation",
        dedupe: `invitation/${plan.id}/${batch}/${id}`,
        subject: "You're invited: " + plan.title,
        expires: start,
        attachments: [
          {
            filename: "teamfare-outing.ics",
            content: Buffer.from(calendarFile(plan, this.origin)).toString(
              "base64",
            ),
          },
        ],
      });
      for (const hours of [24, 2])
        if (start - hours * 3600000 > this.now() + 60000)
          this.enqueue({
            ...common,
            kind: "reminder",
            dedupe: `reminder/${plan.id}/${plan.date}T${plan.time}/${id}/${hours}`,
            subject: "Coming up: " + plan.title,
            at: start - hours * 3600000,
            expires: start,
          });
    }
  }
  start() {
    this.timer = setInterval(() => void this.flush().catch(() => {}), 15000);
    this.timer.unref();
    void this.flush().catch(() => {});
  }
  async close() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.working;
  }
  flush() {
    if (this.working || this.stopping) return this.working ?? Promise.resolve();
    const work = this.process();
    this.working = work;
    void work
      .finally(() => {
        this.working = undefined;
      })
      .catch(() => {});
    return work;
  }
  private async process() {
    const now = this.now();
    this.store.db
      .prepare(
        "UPDATE workflow_emails SET status='failed',error='The safe email retry window expired. Request a fresh message if needed.' WHERE status='pending' AND attempts>0 AND first_attempt_at<?",
      )
      .run(now - 23 * 3600000);
    this.store.db
      .prepare(
        "UPDATE workflow_emails SET status='failed',error='A previous send could not be confirmed within its safe retry window.' WHERE status='sending' AND lease_until<=? AND (coalesce(first_attempt_at,created_at)<? OR attempts>=5)",
      )
      .run(now, now - 23 * 3600000);
    this.store.db
      .prepare(
        "UPDATE workflow_emails SET status='pending' WHERE status='sending' AND lease_until<=? AND attempts<5",
      )
      .run(now);
    this.store.db
      .prepare(
        "UPDATE workflow_emails SET status='cancelled',error='This notification expired before it could be sent.' WHERE status='pending' AND expires_at<=?",
      )
      .run(now);
    if (!this.configured) return;
    for (let i = 0; i < 10 && !this.stopping; i++) {
      const row = this.store.transaction(() => {
        const found = this.store.db
          .prepare(
            "SELECT * FROM workflow_emails WHERE status='pending' AND send_at<=? AND expires_at>? AND attempts<5 ORDER BY send_at LIMIT 1",
          )
          .get(this.now(), this.now()) as Row | undefined;
        if (!found) return undefined;
        this.store.db
          .prepare(
            "UPDATE workflow_emails SET status='sending',attempts=attempts+1,lease_until=?,first_attempt_at=coalesce(first_attempt_at,?) WHERE id=? AND status='pending'",
          )
          .run(this.now() + 60000, this.now(), found.id);
        return { ...found, attempts: found.attempts + 1 };
      });
      if (!row) break;
      if (row.recipient_id && !["expense_report"].includes(row.kind)) {
        const user = this.store.user(row.recipient_id);
        if (
          !user ||
          !user.outing_emails ||
          !user.email_verified_at ||
          this.store.isJudge(user)
        ) {
          this.store.db
            .prepare(
              "UPDATE workflow_emails SET status='suppressed',error='The recipient disabled outing email.' WHERE id=?",
            )
            .run(row.id);
          continue;
        }
      }
      if (
        row.plan_id &&
        [
          "invitation",
          "reminder",
          "review",
          "changes",
          "cancellation",
        ].includes(row.kind)
      ) {
        const found = this.store.plan(row.plan_id, row.team_id),
          plan = found ? (JSON.parse(found.data) as Plan) : undefined;
        const valid =
          plan &&
          (row.kind === "review"
            ? plan.status === "Awaiting approval"
            : row.kind === "changes"
              ? plan.status === "Changes requested"
              : row.kind === "cancellation"
                ? plan.status === "Cancelled"
                : plan.status === "Approved" &&
                  plan.attendees.includes(row.recipient_id ?? "") &&
                  !plan.settledAt &&
                  !plan.declined?.includes(row.recipient_id ?? ""));
        if (!valid) {
          this.store.db
            .prepare(
              "UPDATE workflow_emails SET status='cancelled',error='This notification no longer applies to the current plan.' WHERE id=?",
            )
            .run(row.id);
          continue;
        }
      }
      if (row.plan_id && row.kind === "availability") {
        const poll = this.store.db
          .prepare("SELECT closed FROM availability_polls WHERE plan_id=?")
          .get(row.plan_id) as { closed: number } | undefined;
        if (!poll || poll.closed) {
          this.store.db
            .prepare(
              "UPDATE workflow_emails SET status='cancelled',error='Availability replies are closed.' WHERE id=?",
            )
            .run(row.id);
          continue;
        }
      }
      try {
        await this.mailer.send(this.open(row.payload));
        this.store.db
          .prepare(
            "UPDATE workflow_emails SET status='accepted',accepted_at=?,error=NULL,lease_until=0 WHERE id=?",
          )
          .run(this.now(), row.id);
      } catch {
        const exhausted = row.attempts >= 5;
        this.store.db
          .prepare(
            "UPDATE workflow_emails SET status=?,send_at=?,lease_until=0,error=? WHERE id=?",
          )
          .run(
            exhausted ? "failed" : "pending",
            this.now() +
              [0, 60000, 300000, 900000, 3600000, 3600000][row.attempts],
            exhausted
              ? "The email service did not accept this message after five attempts."
              : "Email acceptance is not confirmed; a safe retry is scheduled.",
            row.id,
          );
      }
    }
  }
}
