import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, appendFile, link, unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const magic = Buffer.from("TEAMFARE-BACKUP-V1\n");
export async function archiveFile(
  operation: "encrypt" | "decrypt",
  source: string,
  destination: string,
  keyHex: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw Error("A 32-byte backup encryption key is required.");
  if (resolve(source) === resolve(destination))
    throw Error("Archive destination must differ from its source.");
  const key = Buffer.from(keyHex, "hex"),
    temporary = destination + ".partial-" + randomUUID(),
    size = (await stat(source)).size;
  try {
    if (operation === "encrypt") {
      if (size < 1) throw Error("Refusing an empty backup.");
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(magic);
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.write(Buffer.concat([magic, iv]));
      } finally {
        await handle.close();
      }
      await pipeline(
        createReadStream(source),
        cipher,
        createWriteStream(temporary, { flags: "a", mode: 0o600 }),
      );
      await appendFile(temporary, cipher.getAuthTag());
    } else {
      if (size <= magic.length + 12 + 16)
        throw Error("Encrypted backup is incomplete.");
      const handle = await open(source, "r"),
        header = Buffer.alloc(magic.length + 12),
        tag = Buffer.alloc(16);
      try {
        await handle.read(header, 0, header.length, 0);
        await handle.read(tag, 0, 16, size - 16);
      } finally {
        await handle.close();
      }
      if (!header.subarray(0, magic.length).equals(magic))
        throw Error("Unsupported backup format.");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        header.subarray(magic.length),
      );
      decipher.setAAD(magic);
      decipher.setAuthTag(tag);
      await pipeline(
        createReadStream(source, { start: header.length, end: size - 17 }),
        decipher,
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
    }
    await link(temporary, destination);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw Error("Archive request too large.");
  }
  try {
    const value = JSON.parse(input) as {
      operation: "encrypt" | "decrypt";
      source: string;
      destination: string;
      key: string;
    };
    if (!["encrypt", "decrypt"].includes(value.operation))
      throw Error("Unsupported archive operation");
    await archiveFile(
      value.operation,
      value.source,
      value.destination,
      value.key,
    );
    console.log("Protected backup archive operation completed.");
  } catch {
    console.error(
      "Protected backup archive failed. Check the file and recovery key.",
    );
    process.exitCode = 1;
  }
}
