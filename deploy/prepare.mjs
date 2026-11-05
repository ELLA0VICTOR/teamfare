// Creates a source-only release and a separate private runtime environment file.
// No provider key or general Vultr-management key is included in the tarball.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const environment = parseEnv(await readFile(join(root, ".env"), "utf8"));
const domain = environment.TEAMFARE_DOMAIN || "teamfare.dixmail.xyz";
if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))
  throw new Error("Set a valid TEAMFARE_DOMAIN.");
const folder = join(root, ".artifacts", "deploy");
await mkdir(folder, { recursive: true, mode: 0o700 });
const files = [
  "package.json",
  "package-lock.json",
  "Dockerfile",
  ".dockerignore",
  "compose.yaml",
  "index.html",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tsconfig.server.json",
  "vite.config.ts",
];
async function collect(directory) {
  for (const entry of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    if (entry.isSymbolicLink())
      throw new Error("Release packaging rejects symbolic links.");
    const path = directory + "/" + entry.name;
    if (path === "server/tests") continue;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.push(path);
  }
}
for (const directory of ["src", "server", "public", "deploy"])
  await collect(directory);
const secretNames = [
  "VULTR_API_KEY",
  "VULTR_INFERENCE_API_KEY",
  "TAVILY_API_KEY",
  "RESEND_API_KEY",
  "AUTH_SECRET",
];
for (const file of files) {
  if (/[\r\n]/.test(file)) throw new Error("Unsafe release filename.");
  const data = await readFile(join(root, file));
  if (
    secretNames.some(
      (name) =>
        environment[name] && data.includes(Buffer.from(environment[name])),
    )
  )
    throw new Error("A runtime secret was found in a release source file.");
}
const manifest = join(folder, "manifest.txt");
await writeFile(manifest, files.sort().join("\n") + "\n");
const archive = join(folder, "teamfare-release.tar.gz");
const tar = spawnSync("tar", ["-czf", archive, "-T", manifest], {
  cwd: root,
  encoding: "utf8",
});
if (tar.status !== 0)
  throw new Error("Could not create release archive: " + tar.stderr);
const envPath = join(folder, "production.env");
let prior = {};
try {
  prior = parseEnv(await readFile(envPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const runtime = {
  APP_ORIGIN: `https://${domain}`,
  TEAMFARE_DOMAIN: domain,
  AUTH_SECRET: prior.AUTH_SECRET || randomBytes(32).toString("hex"),
};
for (const name of [
  "VULTR_INFERENCE_API_KEY",
  "VULTR_INFERENCE_MODEL",
  "TAVILY_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
]) {
  if (!environment[name])
    throw new Error(`Set ${name} before preparing deployment.`);
  runtime[name] = environment[name];
}
for (const value of Object.values(runtime))
  if (/[\r\n]/.test(value))
    throw new Error("Runtime values must be single-line.");
await writeFile(
  envPath,
  Object.entries(runtime)
    .map(([name, value]) => name + "=" + JSON.stringify(value))
    .join("\n") + "\n",
  { mode: 0o600 },
);
const hash = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
await writeFile(
  join(folder, "release.json"),
  JSON.stringify(
    {
      domain,
      sha256: hash,
      files: files.length,
      archive: relative(root, archive),
      environment: relative(root, envPath),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    domain,
    files: files.length,
    sha256: hash,
    archive: relative(root, archive),
    environment: relative(root, envPath),
  }),
);
