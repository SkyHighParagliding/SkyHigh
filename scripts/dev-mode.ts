/**
 * Flip dev safe mode in .env (DECISION-021).
 *   npm run live     DEV_LIVE=1 for LIVE_MINUTES — emails, R2 and Drive writes are REAL
 *   npm run safe     DEV_LIVE=0 — outside writes are logged, not done
 *   npm run devmode  show the current state
 * A running dev server picks the change up within a second; no restart needed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluate, setKey, LIVE_MINUTES } from "../server/utils/devMode.ts";

const envPath = path.resolve(process.cwd(), ".env");
const cmd = process.argv[2] ?? "status";
let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

if (cmd === "live") {
  text = setKey(setKey(text, "DEV_LIVE", "1"), "DEV_LIVE_SINCE", new Date().toISOString());
  writeFileSync(envPath, text);
} else if (cmd === "safe") {
  text = setKey(setKey(text, "DEV_LIVE", "0"), "DEV_LIVE_SINCE", null);
  writeFileSync(envPath, text);
} else if (cmd !== "status") {
  console.error("Usage: npm run live | npm run safe | npm run devmode");
  process.exit(1);
}

const { state, rewrite } = evaluate(text, Date.now(), false);
if (rewrite !== undefined) writeFileSync(envPath, rewrite);
if (state.mode === "live") {
  const until = new Date(state.liveUntil).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Melbourne" });
  console.log(`\n  DEV MODE: LIVE until ${until} (${LIVE_MINUTES} min max)\n  Emails, R2 uploads/deletes and Google Drive writes are REAL.\n  Back to safe: npm run safe\n`);
} else {
  console.log(`\n  DEV MODE: SAFE\n  Emails, R2 and Drive writes are logged as [SAFE] Skipped, not done.\n  Go live for ${LIVE_MINUTES} min: npm run live\n`);
}
