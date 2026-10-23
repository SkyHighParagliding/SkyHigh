/**
 * Copy the production database into the dev database (TASK-042, DECISION-021).
 *
 *   npm run db:pull-prod
 *
 * Read-only on production (pg_dump). Steps: refuse if dev is LIVE or the dev API is
 * running; back up dev to db_backups/; dump production; drop and recreate the dev
 * database; restore; compare every table's row count with production.
 *
 * Production URL: PROD_DATABASE_URL in .env (gitignored), else the Railway CLI
 * (`railway login` first; reads DATABASE_PUBLIC_URL from the Postgres service).
 * Needs Docker Desktop running and the skyhigh-pg-dev container up.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { evaluate } from "../server/utils/devMode.ts";

const CONTAINER = "skyhigh-pg-dev";
const DEV_USER = "skyhigh";
const DEV_DB = "skyhigh_dev";
const KEEP = 3; // dumps of each kind kept in db_backups/
const root = process.cwd();
const backups = path.join(root, "db_backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function fail(msg: string): never {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}
function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv; allowFail?: boolean; shell?: boolean } = {}): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...opts.env }, maxBuffer: 64 * 1024 * 1024, shell: opts.shell });
  if (r.status !== 0 && !opts.allowFail) fail(`${cmd} ${args.slice(0, 3).join(" ")} … failed:\n${(r.stderr || r.stdout || "").trim().slice(0, 800)}`);
  return (r.stdout || "").trim();
}
const step = (s: string) => console.log(`\n▶ ${s}`);
const envText = existsSync(path.join(root, ".env")) ? readFileSync(path.join(root, ".env"), "utf8") : "";

// 1. Safety checks
step("Safety checks");
if (evaluate(envText, Date.now(), false).state.mode !== "safe") fail("Dev is LIVE. Run `npm run safe` first — a production copy must never run with real emails on.");
const apiUp = await new Promise<boolean>((res) => {
  const s = net.connect(3001, "127.0.0.1", () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
});
if (apiUp) fail("The dev server is running (port 3001). Stop it first (Ctrl+C in its window), then run this again.");
if (run("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], { allowFail: true }) !== "true")
  fail(`Container ${CONTAINER} isn't running. Start Docker Desktop, then: docker compose -f docker-compose.dev.yml up -d`);
console.log("  ✓ dev is SAFE, dev server stopped, dev Postgres running");

// 2. Production URL (never printed)
step("Finding the production database");
let prodUrl = envText.match(/^[ \t]*PROD_DATABASE_URL[ \t]*=[ \t]*"?([^"\r\n]+)"?/m)?.[1];
if (!prodUrl) {
  // railway is an npm .cmd shim on Windows, which spawnSync only runs through a shell (fixed string, no user input)
  const out = run("railway variables --service Postgres --json", [], { allowFail: true, shell: true });
  try { prodUrl = JSON.parse(out).DATABASE_PUBLIC_URL; } catch { /* handled below */ }
}
if (!prodUrl) fail("No production URL. Either add PROD_DATABASE_URL=\"postgresql://…\" to .env (Railway → Postgres → Connect → Public URL), or run `railway login` and link this folder.");
const host = (() => { try { return new URL(prodUrl!).host; } catch { return "?"; } })();
if (/localhost|127\.0\.0\.1/.test(host)) fail("PROD_DATABASE_URL points at localhost — that's dev, not production.");
console.log(`  ✓ production: ${host}`);

// 3. Versions: dump/restore with the dev server's major version, which must be >= production's.
const devMajor = Math.floor(Number(run("docker", ["exec", CONTAINER, "psql", "-U", DEV_USER, "-d", DEV_DB, "-Atc", "show server_version_num"])) / 10000);
const image = `postgres:${devMajor}-alpine`;
const viaImage = (sql: string) =>
  run("docker", ["run", "--rm", "-e", "PROD_URL", image, "sh", "-c", `psql "$PROD_URL" -Atc "${sql}"`], { env: { PROD_URL: prodUrl! } });
const prodMajor = Math.floor(Number(viaImage("show server_version_num")) / 10000);
if (prodMajor > devMajor) fail(`Production is Postgres ${prodMajor}, dev is ${devMajor}. Change docker-compose.dev.yml to postgres:${prodMajor}-alpine and recreate the dev volume first.`);
console.log(`  ✓ Postgres: production ${prodMajor}, dev ${devMajor}`);

const countSql = "select table_name||'|'||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1";

// 4. Back up dev
mkdirSync(backups, { recursive: true });
step("Backing up the current dev database");
const devDump = `dev-before-pull-${stamp}.dump`;
run("docker", ["exec", CONTAINER, "pg_dump", "-U", DEV_USER, "-d", DEV_DB, "-Fc", "-f", `/tmp/${devDump}`]);
run("docker", ["cp", `${CONTAINER}:/tmp/${devDump}`, path.join(backups, devDump)]);
run("docker", ["exec", CONTAINER, "rm", "-f", `/tmp/${devDump}`]);
console.log(`  ✓ db_backups/${devDump}`);

// 5. Dump production (read-only)
step("Copying production (read-only)");
const prodDump = `prod-${stamp}.dump`;
run("docker", ["run", "--rm", "-e", "PROD_URL", "-v", `${backups}:/out`, image, "sh", "-c", `pg_dump -d "$PROD_URL" -Fc --no-owner --no-acl -f /out/${prodDump}`], { env: { PROD_URL: prodUrl! } });
const prodCounts = viaImage(countSql);
console.log(`  ✓ db_backups/${prodDump} (${(statSync(path.join(backups, prodDump)).size / 1e6).toFixed(1)} MB)`);

// 6. Replace dev with it
step("Replacing the dev database");
run("docker", ["exec", CONTAINER, "psql", "-U", DEV_USER, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${DEV_DB} WITH (FORCE)`]);
run("docker", ["exec", CONTAINER, "psql", "-U", DEV_USER, "-d", "postgres", "-c", `CREATE DATABASE ${DEV_DB} OWNER ${DEV_USER}`]);
run("docker", ["cp", path.join(backups, prodDump), `${CONTAINER}:/tmp/${prodDump}`]);
const restore = spawnSync("docker", ["exec", CONTAINER, "pg_restore", "-U", DEV_USER, "-d", DEV_DB, "--no-owner", "--no-acl", `/tmp/${prodDump}`], { encoding: "utf8" });
run("docker", ["exec", CONTAINER, "rm", "-f", `/tmp/${prodDump}`]);
const restoreErrors = (restore.stderr || "").split("\n").filter((l) => /error/i.test(l));
if (restoreErrors.length) console.log(`  ! pg_restore reported ${restoreErrors.length} error line(s):\n    ${restoreErrors.slice(0, 8).join("\n    ")}`);
else console.log("  ✓ restored with no errors");

// 7. Compare row counts
step("Comparing row counts with production");
const devCounts = run("docker", ["exec", CONTAINER, "psql", "-U", DEV_USER, "-d", DEV_DB, "-Atc", countSql]);
const toMap = (s: string) => new Map(s.split("\n").filter(Boolean).map((l) => l.split("|") as [string, string]));
const p = toMap(prodCounts), d = toMap(devCounts);
const diffs = [...new Set([...p.keys(), ...d.keys()])].filter((t) => p.get(t) !== d.get(t));
if (diffs.length) {
  console.log(`  ✗ ${diffs.length} table(s) differ:`);
  for (const t of diffs) console.log(`    ${t}: production ${p.get(t) ?? "missing"}, dev ${d.get(t) ?? "missing"}`);
  console.log("  (tables production writes to every few minutes, like weather, can drift by a few rows between the dump and the count)");
} else {
  console.log(`  ✓ all ${p.size} tables match production`);
}

// 8. Prune old dumps
for (const prefix of ["prod-", "dev-before-pull-"]) {
  const files = readdirSync(backups).filter((f) => f.startsWith(prefix) && f.endsWith(".dump")).sort();
  for (const f of files.slice(0, -KEEP)) rmSync(path.join(backups, f));
}

console.log(`\nDone. Dev now matches production. Start it with npm run dev — it stays SAFE (no real emails, R2 or Drive writes).
To undo: restore db_backups/${devDump}.\n`);
if (restoreErrors.length || diffs.length) process.exit(2);
