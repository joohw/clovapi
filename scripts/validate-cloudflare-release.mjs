import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function routeSet(config) {
  return new Set((config.routes ?? [])
    .map((route) => route?.custom_domain === true
      ? `domain:${route.pattern}`
      : `route:${route.pattern}@${route.zone_name ?? route.zone_id ?? ""}`));
}

function requireRoutes(config, expected, label) {
  const actual = routeSet(config);
  requireCondition(
    actual.size === expected.length && expected.every((route) => actual.has(route)),
    `${label} must bind exactly: ${expected.join(", ")}`,
  );
}

function d1Id(config, label) {
  const binding = config.d1_databases?.find((value) => value.binding === "DB");
  const id = binding?.database_id;
  requireCondition(
    typeof id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)
      && id !== "00000000-0000-0000-0000-000000000000"
      && id !== "11111111-1111-1111-1111-111111111111",
    `${label} must contain a real D1 database_id`,
  );
  return id;
}

function main() {
  const target = process.argv[2] ?? "config";
  requireCondition(
    target === "config" || target === "platform" || target === "landing",
    `Unknown validation target: ${target}`,
  );

  if (process.env.WORKERS_CI === "1") {
    requireCondition(
      process.env.WORKERS_CI_BRANCH === "main",
      "Cloudflare production builds may run only from the main branch",
    );
  }

  const platform = read("platform/wrangler.jsonc");
  const landing = read("landing/wrangler.jsonc");

  requireCondition(platform.workers_dev === false, "Production Platform Worker must disable workers.dev");
  requireCondition(landing.workers_dev === false, "Production Web App Worker must disable workers.dev");
  requireRoutes(platform, ["domain:api.clovapi.com"], "Production Platform Worker");
  requireRoutes(
    landing,
    ["route:clovapi.com/*@clovapi.com", "route:www.clovapi.com/*@clovapi.com"],
    "Production Web App Worker",
  );
  requireCondition(platform.vars?.PUBLIC_ORIGIN === "https://api.clovapi.com", "Production PUBLIC_ORIGIN is invalid");
  requireCondition(
    platform.vars?.ALLOWED_ORIGINS === "https://clovapi.com,https://www.clovapi.com",
    "Production ALLOWED_ORIGINS must contain only the two web origins",
  );
  requireCondition(platform.vars?.COOKIE_SECURE === "true", "Production cookies must be secure");
  if (target === "landing") {
    requireCondition(
      process.env.NEXT_PUBLIC_CLOVAPI_API_URL !== undefined,
      "Landing build must set NEXT_PUBLIC_CLOVAPI_API_URL",
    );
  }
  if (process.env.NEXT_PUBLIC_CLOVAPI_API_URL !== undefined) {
    requireCondition(
      process.env.NEXT_PUBLIC_CLOVAPI_API_URL === platform.vars.PUBLIC_ORIGIN,
      "Landing build API URL must match the production Platform Worker origin",
    );
  }

  d1Id(platform, "Production Platform Worker");

  console.log("Cloudflare production release configuration is valid.");
}

try {
  main();
} catch (error) {
  console.error(`Cloudflare release configuration is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}
