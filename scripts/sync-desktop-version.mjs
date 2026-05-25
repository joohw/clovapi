import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(repoRoot, "electron", "package.json");

const raw = String(process.env.RELEASE_VERSION || process.env.GITHUB_REF_NAME || "").trim();
const version = raw.replace(/^v/i, "");
if (!version) {
  console.error("[sync-desktop-version] RELEASE_VERSION or GITHUB_REF_NAME is required");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`[sync-desktop-version] electron/package.json -> ${version}`);
