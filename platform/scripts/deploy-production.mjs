import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const required = ["AUTH_SECRET", "RESEND_API_KEY", "RESEND_FROM"];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const sourceArgument = process.argv[2];

if (!sourceArgument) {
  throw new Error("Usage: node scripts/deploy-production.mjs <secrets.env>");
}

const sourcePath = resolve(projectDirectory, sourceArgument);
if (!existsSync(sourcePath)) throw new Error(`Secrets file not found: ${sourcePath}`);

const parsed = parseEnv(readFileSync(sourcePath, "utf8"));
const secrets = Object.fromEntries(required.map((name) => {
  const value = parsed[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required production secret: ${name}`);
  }
  return [name, value];
}));

const temporaryRoot = `${resolve(tmpdir())}${sep}`;
const temporaryDirectory = resolve(mkdtempSync(join(tmpdir(), "clovapi-deploy-")));
if (!`${temporaryDirectory}${sep}`.startsWith(temporaryRoot)) {
  throw new Error(`Refusing to use unexpected temporary directory: ${temporaryDirectory}`);
}

const secretsPath = join(temporaryDirectory, "secrets.json");
const wranglerPath = resolve(projectDirectory, "node_modules", "wrangler", "bin", "wrangler.js");

try {
  writeFileSync(secretsPath, JSON.stringify(secrets), { encoding: "utf8", mode: 0o600 });
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "deploy", "--strict", "--secrets-file", secretsPath],
    { cwd: projectDirectory, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
