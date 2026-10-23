/**
 * Dev safe mode tests — no network, no database. Uses a temp folder as cwd for .env.
 *
 * Run with:  node --import tsx/esm server/utils/devMode.test.mjs
 *
 * Covers the parts that would fail dangerously if wrong: missing/0 key = safe,
 * the 60-minute window and its write-back to 0, live with no start time getting
 * stamped, production ignoring the key, and that in safe mode sendEmail() and
 * R2 saveFile()/deleteFile() never touch the network.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

const dir = mkdtempSync(path.join(tmpdir(), "devmode-"));
const startCwd = process.cwd();
process.chdir(dir);
process.env.NODE_ENV = "development";
// R2 "configured" so the tests prove the gate, not missing keys, stops the upload.
Object.assign(process.env, {
  R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test",
  R2_BUCKET_NAME: "test", R2_PUBLIC_URL: "https://r2.example.test", RESEND_API_KEY: "re_test",
});
let netCalls = 0;
globalThis.fetch = async () => { netCalls++; throw new Error("network not allowed in tests"); };

const { evaluate, setKey, getDevMode, isDevLive, LIVE_MINUTES } = await import("./devMode.ts");
const { sendEmail } = await import("./email.ts");
const { saveFile, deleteFile, publicUrl } = await import("../storage.ts");

const T0 = Date.parse("2026-10-23T02:00:00.000Z");
const MIN = 60_000;
const env = (body) => `DATABASE_URL="x"\n${body}`;
const write = (body) => { writeFileSync(path.join(dir, ".env"), body); };
const read = () => readFileSync(path.join(dir, ".env"), "utf8");

try {
  console.log("\nevaluate()");
  assert(evaluate(env(""), T0, false).state.mode === "safe", "no DEV_LIVE key → safe");
  assert(evaluate(env('DEV_LIVE="0"'), T0, false).state.mode === "safe", "DEV_LIVE=0 → safe");
  assert(evaluate(env("DEV_LIVE=yes"), T0, false).state.mode === "safe", "anything but 1 → safe");
  assert(evaluate(env("DEV_LIVE=1"), T0, true).state.mode === "production", "production ignores the key");
  assert(evaluate(env(""), T0, true).state.mode === "production", "production with no key is still live (production)");

  const since = new Date(T0).toISOString();
  const live = evaluate(env(`DEV_LIVE="1"\nDEV_LIVE_SINCE="${since}"`), T0 + 59 * MIN, false);
  assert(live.state.mode === "live" && live.rewrite === undefined, "59 min after going live → still live, file untouched");
  assert(live.state.liveUntil === new Date(T0 + LIVE_MINUTES * MIN).toISOString(), "liveUntil = start + 60 min");

  const expired = evaluate(env(`DEV_LIVE="1"\nDEV_LIVE_SINCE="${since}"`), T0 + 60 * MIN, false);
  assert(expired.state.mode === "safe", "60 min after going live → safe");
  assert(/DEV_LIVE="0"/.test(expired.rewrite) && !/DEV_LIVE_SINCE/.test(expired.rewrite), "expiry rewrites DEV_LIVE=0 and drops DEV_LIVE_SINCE");
  assert(/DATABASE_URL="x"/.test(expired.rewrite), "expiry keeps the other .env lines");

  const unstamped = evaluate(env("DEV_LIVE=1"), T0, false);
  assert(unstamped.state.mode === "live" && /DEV_LIVE_SINCE="2026-10-23T02:00:00.000Z"/.test(unstamped.rewrite), "live with no start time → stamped now (hand-edited .env)");
  const future = evaluate(env(`DEV_LIVE=1\nDEV_LIVE_SINCE="2099-01-01T00:00:00Z"`), T0, false);
  assert(future.rewrite !== undefined && future.rewrite.includes(since), "start time in the future → re-stamped now, can't extend the window");

  console.log("\nsetKey()");
  assert(setKey("A=1\n", "B", "2") === 'A=1\nB="2"\n', "appends a missing key");
  assert(setKey('A=1\nB="old"\nC=3\n', "B", "new") === 'A=1\nB="new"\nC=3\n', "replaces in place");
  assert(setKey('A=1\r\nB=2\r\nC=3\r\n', "B", null) === "A=1\r\nC=3\r\n", "removes a line (CRLF file)");

  console.log("\ngetDevMode() against a real .env");
  if (existsSync(path.join(dir, ".env"))) rmSync(path.join(dir, ".env"));
  assert(getDevMode().mode === "safe" && !isDevLive(), "no .env file → safe");
  write(env(`DEV_LIVE="1"\nDEV_LIVE_SINCE="${new Date(Date.now() - 61 * MIN).toISOString()}"`));
  assert(getDevMode().mode === "safe", "expired window in the file → safe");
  assert(/DEV_LIVE="0"/.test(read()) && !/DEV_LIVE_SINCE/.test(read()), "server wrote DEV_LIVE=0 back to .env");
  write(env(`DEV_LIVE="1"\nDEV_LIVE_SINCE="${new Date(Date.now() - 5 * MIN).toISOString()}"`));
  assert(isDevLive(), "flipping the file to live takes effect without a restart");
  write(env('DEV_LIVE="0"'));
  assert(!isDevLive(), "flipping back to 0 takes effect without a restart");

  console.log("\nsafe mode blocks outside writes");
  netCalls = 0;
  const r = await sendEmail({ to: "member@example.test", subject: "Test", html: "<p>x</p>" });
  assert(r.success === true && netCalls === 0, "sendEmail: reports success, no network call");
  const url = await saveFile(Buffer.from("x"), "images/test/devmode.txt", "text/plain");
  assert(url === "/uploads/images/test/devmode.txt" && netCalls === 0, "saveFile: saved locally, not to R2");
  assert(existsSync(path.join(dir, "uploads/images/test/devmode.txt")), "saveFile: local file exists");
  assert(publicUrl("k.jpg") === "/uploads/k.jpg", "publicUrl matches where saveFile put it");
  await deleteFile("https://r2.example.test/images/hero/prod.jpg");
  assert(netCalls === 0, "deleteFile on a production R2 URL: skipped, no network call");
  await deleteFile("/uploads/images/test/devmode.txt");
  assert(!existsSync(path.join(dir, "uploads/images/test/devmode.txt")), "deleteFile on a local /uploads file still works");

  console.log("\nlive mode lets them through");
  write(env(`DEV_LIVE="1"\nDEV_LIVE_SINCE="${new Date().toISOString()}"`));
  netCalls = 0;
  const live2 = await sendEmail({ to: "member@example.test", subject: "Test", html: "<p>x</p>" });
  assert(netCalls === 1 && live2.success === false, "sendEmail in live mode calls Resend (stubbed to fail here)");
} finally {
  process.chdir(startCwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
