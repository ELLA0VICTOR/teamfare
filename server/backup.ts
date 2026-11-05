import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, chmod, access, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export async function backupDatabase(
  sourcePath: string,
  destinationPath: string,
) {
  const source = resolve(sourcePath),
    destination = resolve(destinationPath);
  if (source === destination)
    throw new Error("Backup destination must differ from the live database.");
  await access(source, constants.R_OK);
  try {
    await access(destination);
    throw new Error(
      "Backup destination already exists; refusing to overwrite it.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = destination + ".partial-" + randomUUID();
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, temporary);
    if (process.platform !== "win32") await chmod(temporary, 0o600);
    const check = new DatabaseSync(temporary, { readOnly: true });
    try {
      const row = check.prepare("PRAGMA integrity_check").get();
      if (!row || Object.values(row)[0] !== "ok")
        throw new Error("Backup integrity check failed.");
    } finally {
      check.close();
    }
    // Publish atomically without replacing a concurrent backup with the same name.
    await link(temporary, destination);
  } finally {
    db.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination)
    throw new Error(
      "Usage: node server/backup.ts SOURCE.sqlite NEW_BACKUP.sqlite",
    );
  await backupDatabase(source, destination);
  console.log("SQLite online backup completed and passed integrity_check.");
}
