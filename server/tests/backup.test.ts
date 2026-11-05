import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDatabase } from "../backup.ts";

test("online backup captures committed WAL data, restores cleanly and refuses overwriting live files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "teamfare-backup-")),
    source = join(directory, "live.sqlite"),
    destination = join(directory, "backups", "snapshot.sqlite");
  const writer = new DatabaseSync(source);
  t.after(async () => {
    writer.close();
    await rm(directory, { recursive: true, force: true });
  });
  writer.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE evidence(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO evidence(value) VALUES('committed before backup');",
  );
  await backupDatabase(source, destination);
  const restored = new DatabaseSync(destination);
  assert.equal(
    restored.prepare("SELECT value FROM evidence").get()!.value,
    "committed before backup",
  );
  writer.exec("INSERT INTO evidence(value) VALUES('later live change');");
  assert.equal(
    restored.prepare("SELECT COUNT(*) AS n FROM evidence").get()!.n,
    1,
  );
  restored.close();
  await assert.rejects(backupDatabase(source, source), /differ/);
  await assert.rejects(backupDatabase(source, destination), /overwrite/);
});
