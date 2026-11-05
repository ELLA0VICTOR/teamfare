import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import type { Plan, Expense } from "../src/data.ts";
import type { ResearchRun } from "../src/research.ts";

export type UserRow = {
  id: string;
  team_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "employee" | "manager";
  department: string;
  preference: string;
  email_verified_at: string | null;
  auth_version: number;
};
export type PlanRow = {
  id: string;
  team_id: string;
  creator_id: string;
  data: string;
  revision: number;
};

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:" && process.platform !== "win32")
      chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
        name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('employee','manager')), department TEXT NOT NULL DEFAULT 'Team',
        preference TEXT NOT NULL DEFAULT 'No preference'
      );
      CREATE INDEX IF NOT EXISTS users_team ON users(team_id);
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('employee','manager')), created_by TEXT NOT NULL REFERENCES users(id),
        expires INTEGER NOT NULL, used_by TEXT REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), creator_id TEXT NOT NULL REFERENCES users(id),
        data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS plans_team ON plans(team_id);
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), plan_id TEXT NOT NULL REFERENCES plans(id),
        created_by TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS expenses_team ON expenses(team_id);
      CREATE TABLE IF NOT EXISTS saved_ideas (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, experience_id TEXT NOT NULL,
        PRIMARY KEY(user_id, experience_id)
      );
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), user_id TEXT NOT NULL REFERENCES users(id),
        request_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
        UNIQUE(user_id,request_id)
      );
      CREATE INDEX IF NOT EXISTS research_user ON research_runs(user_id,created_at);
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);
    `);
    const version3 = this.db
      .prepare("SELECT version FROM schema_migrations WHERE version=3")
      .get();
    if (!version3)
      this.transaction(() => {
        this.db.exec(`
        ALTER TABLE users ADD COLUMN email_verified_at TEXT;
        ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
        DELETE FROM sessions;
        CREATE TABLE auth_challenges (
          id TEXT PRIMARY KEY, purpose TEXT NOT NULL, email TEXT NOT NULL,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL,
          payload TEXT NOT NULL, expires INTEGER NOT NULL, resend_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0, sends INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL, consumed_at INTEGER
        );
        CREATE INDEX challenges_email ON auth_challenges(email,expires);
        CREATE TABLE auth_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE auth_audit (id INTEGER PRIMARY KEY, user_id TEXT REFERENCES users(id),event TEXT NOT NULL,at INTEGER NOT NULL);
        CREATE TABLE auth_notifications (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
          created_at INTEGER NOT NULL, sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO schema_migrations(version) VALUES(3);
      `);
      });
    if (
      !this.db
        .prepare("SELECT version FROM schema_migrations WHERE version=4")
        .get()
    )
      this.transaction(() => {
        this.db
          .exec(`ALTER TABLE sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
        DELETE FROM sessions;
        INSERT INTO schema_migrations(version) VALUES(4);`);
      });
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  user(id: string) {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      UserRow | undefined;
  }
  userByEmail(email: string) {
    return this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      UserRow | undefined;
  }
  members(teamId: string) {
    return (
      this.db
        .prepare(
          "SELECT id,name,role,department FROM users WHERE team_id = ? ORDER BY rowid",
        )
        .all(teamId) as Pick<UserRow, "id" | "name" | "role" | "department">[]
    ).map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      team: user.department,
      initials: user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase(),
    }));
  }
  plan(id: string, teamId: string) {
    return this.db
      .prepare("SELECT * FROM plans WHERE id = ? AND team_id = ?")
      .get(id, teamId) as PlanRow | undefined;
  }
  state(user: UserRow) {
    return {
      version: 1 as const,
      plans: (
        this.db
          .prepare(
            "SELECT data,revision FROM plans WHERE team_id = ? ORDER BY rowid",
          )
          .all(user.team_id) as { data: string; revision: number }[]
      ).map((row) => ({
        ...(JSON.parse(row.data) as Plan),
        revision: row.revision,
      })),
      expenses: (
        this.db
          .prepare("SELECT data FROM expenses WHERE team_id = ? ORDER BY rowid")
          .all(user.team_id) as { data: string }[]
      ).map((row) => JSON.parse(row.data) as Expense),
      saved: (
        this.db
          .prepare("SELECT experience_id FROM saved_ideas WHERE user_id = ?")
          .all(user.id) as { experience_id: string }[]
      ).map((row) => row.experience_id),
      preference: user.preference,
      researchRuns: (
        this.db
          .prepare(
            "SELECT data FROM research_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
          )
          .all(user.id) as { data: string }[]
      ).map((row) => JSON.parse(row.data) as ResearchRun),
    };
  }
  close() {
    this.db.close();
  }
}
