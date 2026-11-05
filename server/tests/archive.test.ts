import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { archiveFile } from "../archive.ts";
test("encrypted backup archives authenticate bytes, hide plaintext, reject wrong keys and never replace a destination", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "teamfare-archive-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "source.sqlite"),
    encrypted = join(dir, "encrypted"),
    restored = join(dir, "restored"),
    key = randomBytes(32).toString("hex");
  const bytes = Buffer.concat([
    Buffer.from("Private SQLite receipt backup"),
    randomBytes(1024 * 1024),
  ]);
  await writeFile(source, bytes);
  await archiveFile("encrypt", source, encrypted, key);
  assert.equal(
    (await readFile(encrypted)).includes(
      Buffer.from("Private SQLite receipt backup"),
    ),
    false,
  );
  await archiveFile("decrypt", encrypted, restored, key);
  assert.deepEqual(await readFile(restored), bytes);
  await assert.rejects(archiveFile("decrypt", encrypted, restored, key));
  await assert.rejects(
    archiveFile(
      "decrypt",
      encrypted,
      join(dir, "wrong"),
      randomBytes(32).toString("hex"),
    ),
  );
  const modified = await readFile(encrypted);
  modified[100] ^= 1;
  await writeFile(encrypted, modified);
  await assert.rejects(
    archiveFile("decrypt", encrypted, join(dir, "tampered"), key),
  );
  assert.deepEqual(await readFile(source), bytes);
});
