// Prepare an initial migration only; never replace an existing production database.
import { backupDatabase } from "../server/backup.ts";
import { DatabaseSync } from "node:sqlite";
import { readFile, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
const env = parseEnv(await readFile(".env", "utf8"));
const source = resolve(env.DATABASE_PATH || "data/teamfare.sqlite"),
  destination = resolve(process.argv[2] || ".artifacts/deploy/initial.sqlite");
await access(source);
await backupDatabase(source, destination);
const db = new DatabaseSync(destination);
try {
  db.exec(
    "BEGIN IMMEDIATE; DELETE FROM sessions; DELETE FROM auth_challenges; DELETE FROM auth_limits; UPDATE users SET auth_version=auth_version+1; COMMIT;",
  );
  const counts = Object.fromEntries(
    ["teams", "users", "plans", "expenses"].map((table) => [
      table,
      db.prepare("SELECT COUNT(*) AS n FROM " + table).get().n,
    ]),
  );
  console.log(
    JSON.stringify({
      initialMigrationPrepared: true,
      ...counts,
      oldSessionsRemoved: true,
      sourceUnchanged: true,
    }),
  );
} finally {
  db.close();
}
