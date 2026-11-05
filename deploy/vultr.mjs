// Operator-only provisioning. Never loaded by Teamfare's server or frontend.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isIPv4 } from "node:net";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  folder = join(root, ".artifacts", "deploy");
await mkdir(folder, { recursive: true, mode: 0o700 });
const env = parseEnv(await readFile(join(root, ".env"), "utf8")),
  key = env.VULTR_API_KEY?.trim();
if (!key)
  throw new Error(
    "Set the general VULTR_API_KEY in .env. The Inference key cannot provision servers.",
  );
async function api(path, method = "GET", body) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid Vultr API path.");
  const response = await fetch("https://api.vultr.com/v2" + path, {
    method,
    redirect: "error",
    headers: {
      Authorization: "Bearer " + key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Vultr API ${method} ${path} returned HTTP ${response.status}. Check API access, allowed IPs and account permissions.`,
    );
  }
  return response.status === 204 ? {} : response.json();
}
const statePath = join(folder, "vultr.json");
let state;
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
async function save() {
  await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}
const instances = (await api("/instances?per_page=100")).instances ?? [];
if (process.argv[2] === "status") {
  if (!state?.instanceId) {
    console.log("No deployment instance recorded yet.");
    process.exit(0);
  }
  const instance = (await api("/instances/" + state.instanceId)).instance;
  state.mainIp = instance.main_ip;
  state.status = instance.status;
  state.serverStatus = instance.server_status;
  state.powerStatus = instance.power_status;
  await save();
  console.log(
    JSON.stringify({
      id: state.instanceId,
      ip: state.mainIp,
      status: state.status,
      serverStatus: state.serverStatus,
      powerStatus: state.powerStatus,
    }),
  );
  process.exit(0);
}
const [planData, osData] = await Promise.all([
  api("/plans?per_page=100"),
  api("/os?per_page=100"),
]);
const plans = (planData.plans ?? [])
  .filter(
    (plan) =>
      ["vc2", "vhp"].includes(plan.type) &&
      plan.ram >= 2048 &&
      plan.ram <= 4096 &&
      plan.vcpu_count <= 2 &&
      plan.monthly_cost > 0 &&
      plan.monthly_cost <= 20,
  )
  .sort((a, b) => a.monthly_cost - b.monthly_cost);
const os = (osData.os ?? []).find(
  (os) => os.name.includes("Ubuntu 24.04") && os.arch === "x64",
);
if (!os || !plans.length)
  throw new Error(
    "No supported Ubuntu 24.04 image or compute plan under $20/month was found.",
  );
let choice;
for (const region of [env.VULTR_REGION || "lhr", "fra", "ams"]) {
  let available;
  try {
    available =
      (await api("/regions/" + region + "/availability")).available_plans ?? [];
  } catch {
    continue;
  }
  const plan = plans.find((plan) => available.includes(plan.id));
  if (plan) {
    choice = { region, plan };
    break;
  }
}
if (!choice)
  throw new Error(
    "No suitable compute capacity was found in the selected regions.",
  );
const quote = {
  region: choice.region,
  plan: choice.plan.id,
  ramMB: choice.plan.ram,
  vcpu: choice.plan.vcpu_count,
  monthlyCostUSD: choice.plan.monthly_cost,
  os: os.name,
  existingInstances: instances.map((instance) => ({
    id: instance.id,
    label: instance.label,
    ip: instance.main_ip,
    status: instance.status,
  })),
};
if (process.argv[2] !== "create") {
  console.log(JSON.stringify(quote, null, 2));
  process.exit(0);
}
if (!state) {
  const id = randomUUID().slice(0, 8);
  state = {
    label: "teamfare-production-" + id,
    keyPath: join(folder, "teamfare_ed25519"),
    domain: env.TEAMFARE_DOMAIN || "teamfare.dixmail.xyz",
  };
  await save();
}
const existing = instances.find(
  (instance) =>
    instance.id === state.instanceId || instance.label === state.label,
);
if (existing) {
  state.instanceId = existing.id;
  state.mainIp = existing.main_ip;
  await save();
  console.log(
    JSON.stringify({
      resumed: true,
      id: existing.id,
      ip: existing.main_ip,
      status: existing.status,
    }),
  );
  process.exit(0);
}
try {
  await access(state.keyPath);
} catch {
  const result = spawnSync(
    "ssh-keygen",
    [
      "-q",
      "-t",
      "ed25519",
      "-f",
      state.keyPath,
      "-N",
      "",
      "-C",
      "teamfare-deploy",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error("Could not generate the deployment SSH key.");
}
const publicKey = (await readFile(state.keyPath + ".pub", "utf8")).trim();
if (!state.sshKeyId) {
  const data = await api("/ssh-keys", "POST", {
    name: state.label,
    ssh_key: publicKey,
  });
  state.sshKeyId = data.ssh_key.id;
  await save();
}
if (!state.firewallId) {
  const data = await api("/firewalls", "POST", { description: state.label });
  state.firewallId = data.firewall_group.id;
  await save();
}
if (!state.firewallReady) {
  const external = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(15000),
  }).then((response) => response.json());
  if (!isIPv4(external.ip))
    throw new Error(
      "Could not determine a valid IPv4 address for restricted SSH access.",
    );
  state.operatorIp = external.ip;
  await save();
  const existingRules =
    (await api("/firewalls/" + state.firewallId + "/rules")).firewall_rules ??
    [];
  for (const rule of [
    { protocol: "tcp", port: "22", subnet: external.ip, subnet_size: 32 },
    { protocol: "tcp", port: "80", subnet: "0.0.0.0", subnet_size: 0 },
    { protocol: "tcp", port: "443", subnet: "0.0.0.0", subnet_size: 0 },
    { protocol: "udp", port: "443", subnet: "0.0.0.0", subnet_size: 0 },
  ]) {
    if (
      !existingRules.some(
        (old) =>
          old.protocol === rule.protocol &&
          old.port === rule.port &&
          old.subnet === rule.subnet &&
          old.subnet_size === rule.subnet_size,
      )
    )
      await api("/firewalls/" + state.firewallId + "/rules", "POST", {
        ip_type: "v4",
        ...rule,
        notes: state.label,
      });
  }
  state.firewallReady = true;
  await save();
}
const userData =
  '#cloud-config\nssh_pwauth: false\nwrite_files:\n  - path: /etc/ssh/sshd_config.d/60-teamfare.conf\n    permissions: "0600"\n    content: |\n      PasswordAuthentication no\n      KbdInteractiveAuthentication no\n      PermitRootLogin prohibit-password\n      MaxAuthTries 3\nruncmd:\n  - [systemctl, reload, ssh]\n';
state.region = choice.region;
state.plan = choice.plan.id;
state.monthlyCostUSD = choice.plan.monthly_cost;
await save();
const created = await api("/instances", "POST", {
  region: choice.region,
  plan: choice.plan.id,
  os_id: os.id,
  label: state.label,
  hostname: "teamfare",
  sshkey_id: [state.sshKeyId],
  firewall_group_id: state.firewallId,
  user_data: Buffer.from(userData).toString("base64"),
  enable_ipv6: false,
  backups: "disabled",
  activation_email: false,
  tags: ["teamfare"],
});
state.instanceId = created.instance.id;
state.mainIp = created.instance.main_ip;
await save();
console.log(
  JSON.stringify({
    created: true,
    id: state.instanceId,
    ip: state.mainIp,
    region: state.region,
    plan: state.plan,
    monthlyCostUSD: state.monthlyCostUSD,
  }),
);
