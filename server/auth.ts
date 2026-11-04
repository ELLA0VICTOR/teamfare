import {
  createHash,
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";

const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    derive(password, salt, 64, parameters, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await scrypt(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split("$");
  if (algorithm !== "scrypt-v1" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex"),
    actual = await scrypt(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const sessionCookie = "teamfare_session";
