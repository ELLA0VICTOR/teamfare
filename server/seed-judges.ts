// Deliberately public credentials for a separate shared demonstration team.
// No real account is marked as a judge account by signup or configuration.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Store } from "./store.ts";
import { hashPassword, verifyPassword } from "./auth.ts";
import type { Plan, Expense } from "../src/data.ts";

export const judgeTeamId = "teamfare-public-judges-v1";
export const judgeAccounts = [
  {
    id: "teamfare-judge-manager",
    name: "Judge Manager",
    role: "manager",
    email: "manager@judges.teamfare.invalid",
    password: "TeamfareManager2026!",
  },
  {
    id: "teamfare-judge-organiser",
    name: "Judge Organiser",
    role: "employee",
    email: "organiser@judges.teamfare.invalid",
    password: "TeamfareOrganiser2026!",
  },
] as const;

export async function seedJudges(store: Store) {
  const now = new Date().toISOString();
  const prepared = await Promise.all(
    judgeAccounts.map(async (account) => {
      const existing = store.user(account.id),
        emailOwner = store.userByEmail(account.email);
      if (emailOwner && emailOwner.id !== account.id)
        throw new Error(
          "Judge email belongs to another account; refusing to replace it.",
        );
      if (
        existing &&
        (existing.email !== account.email ||
          existing.team_id !== judgeTeamId ||
          existing.role !== account.role ||
          !store.isJudge(existing) ||
          !(await verifyPassword(account.password, existing.password_hash)))
      )
        throw new Error(
          "Existing account differs from the judge seed; refusing to overwrite credentials.",
        );
      return {
        account,
        hash: existing ? null : await hashPassword(account.password),
      };
    }),
  );
  const date = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const base = {
    time: "13:00",
    people: 4,
    budget: 100000,
    note: "Authored sample for judging. No venue has been contacted, booked or paid.",
    attendees: judgeAccounts.map((a) => a.id),
    going: [],
    declined: [],
    createdBy: judgeAccounts[1].id,
    revision: 1,
  };
  const plans: Plan[] = [
    {
      ...base,
      id: "judge-lunch-v1",
      experienceId: "long-table",
      title: "Sample team lunch",
      date: date(7),
      status: "Approved",
      unitPrice: 18500,
    },
    {
      ...base,
      id: "judge-clay-v1",
      experienceId: "clay",
      title: "Sample pottery afternoon",
      date: date(10),
      status: "Awaiting approval",
      unitPrice: 22000,
    },
    {
      ...base,
      id: "judge-past-v1",
      experienceId: "long-table",
      title: "Sample previous team meal",
      date: date(-8),
      status: "Approved",
      unitPrice: 18500,
    },
  ];
  const expenses: Expense[] = [
    {
      id: "judge-deposit-v1",
      planId: plans[0].id,
      description: "Sample lunch deposit (record only)",
      amount: 15000,
      payer: judgeAccounts[1].name,
      date: date(0),
      category: "Food & drinks",
    },
    {
      id: "judge-past-expense-v1",
      planId: plans[2].id,
      description: "Sample previous meal (record only)",
      amount: 68000,
      payer: judgeAccounts[1].name,
      date: date(-8),
      category: "Food & drinks",
    },
  ];
  store.transaction(() => {
    const team = store.db
      .prepare("SELECT name FROM teams WHERE id=?")
      .get(judgeTeamId);
    if (team && team.name !== "Teamfare · Judge team")
      throw new Error("Judge team identity differs; refusing replacement.");
    store.db
      .prepare("INSERT OR IGNORE INTO teams(id,name,created_at) VALUES(?,?,?)")
      .run(judgeTeamId, "Teamfare · Judge team", now);
    for (const { account, hash } of prepared) {
      if (!store.user(account.id)) {
        store.db
          .prepare(
            "INSERT INTO users(id,team_id,name,email,password_hash,role,email_verified_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            account.id,
            judgeTeamId,
            account.name,
            account.email,
            hash,
            account.role,
            now,
          );
        store.db
          .prepare("INSERT INTO judge_accounts(user_id) VALUES(?)")
          .run(account.id);
      }
    }
    for (const plan of plans) {
      plan.events = [
        {
          id: "seed-" + plan.id,
          at: now,
          text: `Seeded as an ${plan.status.toLowerCase()} sample for judging. No booking, invitation or payment was made.`,
        },
      ];
      store.db
        .prepare(
          "INSERT OR IGNORE INTO plans(id,team_id,creator_id,data) VALUES(?,?,?,?)",
        )
        .run(plan.id, judgeTeamId, base.createdBy, JSON.stringify(plan));
    }
    for (const expense of expenses)
      store.db
        .prepare(
          "INSERT OR IGNORE INTO expenses(id,team_id,plan_id,created_by,data) VALUES(?,?,?,?,?)",
        )
        .run(
          expense.id,
          judgeTeamId,
          expense.planId,
          base.createdBy,
          JSON.stringify(expense),
        );
  });
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const store = new Store(
    process.env.DATABASE_PATH ?? "./data/teamfare.sqlite",
  );
  try {
    await seedJudges(store);
    console.log(
      "Judge team ready. Existing credentials and activity were preserved; see README for public judge access.",
    );
  } finally {
    store.close();
  }
}
