/**
 * eval-smart-search.mjs
 *
 * Regression eval harness for SkyHigh's public Smart Search.
 *
 * Usage:
 *   node scripts/eval-smart-search.mjs          # unit tests only
 *   node scripts/eval-smart-search.mjs --live   # unit tests + live endpoint smoke
 *
 * Unit phase:  spawns `npx tsx scripts/eval-smart-search-units.ts` (inherit stdio).
 * Live phase:  POSTs to http://localhost:3001/api/search/public and inspects
 *              the SSE response stream.  Skipped gracefully if server unreachable.
 *
 * Exit code 1 if any phase has failures.
 */

import { spawn } from 'child_process';

const isLive = process.argv.includes('--live');

// ---------------------------------------------------------------------------
// Phase 1 — Unit tests (TypeScript via tsx)
// ---------------------------------------------------------------------------

async function runUnits() {
  return new Promise((resolve) => {
    // On Windows, npx is a .cmd file and requires shell:true.
    const child = spawn(
      'npx',
      ['tsx', 'scripts/eval-smart-search-units.ts'],
      { stdio: 'inherit', shell: true },
    );
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error('Failed to spawn unit runner:', err.message);
      resolve(1);
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 2 — Live endpoint smoke tests
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3001/api/search/public';
const LIVE_TIMEOUT_MS = 90_000;

let livePassed = 0;
let liveFailed = 0;

function liveReport(id, ok, description, detail) {
  if (ok) {
    livePassed++;
    console.log(`PASS  ${id}  ${description}`);
  } else {
    liveFailed++;
    console.log(`FAIL  ${id}  ${description}${detail ? ` [${detail}]` : ''}`);
  }
}

/**
 * POST to the public search endpoint and accumulate the full SSE response text.
 * Returns { text, elapsedMs } or throws on timeout / network error.
 */
async function ssePost(query, history = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  const start = Date.now();

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, history }),
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let done = false;
  let buffer = '';

  try {
    while (!done) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        let payload;
        try { payload = JSON.parse(raw); } catch { continue; }

        if (typeof payload.token === 'string') fullText += payload.token;
        if (typeof payload.replace === 'string') fullText = payload.replace;
        if (payload.done === true) { done = true; break; }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }

  return { text: fullText, elapsedMs: Date.now() - start };
}

/** Check whether the server is reachable with a short probe. */
async function serverReachable() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '__probe__', history: [] }),
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  }
}

async function runLive() {
  console.log('\n── Live endpoint smoke tests ──');

  if (!await serverReachable()) {
    console.log('LIVE: server not reachable on :3001 — skipped');
    return 0; // live skip does not count as failure
  }

  // L-emergency — safety gate fires before AI, must respond in < 3 s.
  try {
    const { text, elapsedMs } = await ssePost('help i am stuck in a tree please get me down');
    liveReport('L-emergency', text.includes('call 000 (Triple Zero) now'),
      'Emergency query — response contains "call 000 (Triple Zero) now"',
      `elapsed=${elapsedMs}ms`);
    liveReport('L-emergency', elapsedMs < 3000,
      'Emergency query — response arrived in < 3 s (no AI call)',
      `elapsed=${elapsedMs}ms`);
  } catch (err) {
    liveReport('L-emergency', false, 'Emergency query — request failed', String(err));
    liveReport('L-emergency', false, 'Emergency query — elapsed check skipped (request failed)');
  }

  // L-verdict-paps — PG3 at The Paps (pgRating "PG4"): must say supervision required.
  try {
    const { text } = await ssePost("I'm at PG3 can I fly at the paps");
    liveReport('L-verdict-paps', /supervis/i.test(text),
      'Paps verdict — response mentions supervision', text.slice(0, 200));
    liveReport('L-verdict-paps',
      !text.includes('unsupervised at The Paps') &&
      !/you are qualified to fly at The Paps unsupervised/i.test(text),
      'Paps verdict — does NOT grant unsupervised access at The Paps',
      text.slice(0, 200));
  } catch (err) {
    liveReport('L-verdict-paps', false, 'Paps verdict — request failed', String(err));
    liveReport('L-verdict-paps', false, 'Paps unsupervised check — skipped');
  }

  // L-verdict-golf — PG3 at Flinders Golf Club ("PG2 Supervised"): unsupervised.
  try {
    const { text } = await ssePost("Im a PG3, what are the requirements at Flinders Golf Club?");
    liveReport('L-verdict-golf', /unsupervised/i.test(text),
      'Golf Club verdict — response contains /unsupervised/i (PG3 needs none)', text.slice(0, 200));
    liveReport('L-verdict-golf',
      !/you (require|need) (a )?(PG4|PG5|supervisor|supervision)/i.test(text),
      'Golf Club verdict — does NOT demand PG4/PG5/supervision of PG3',
      text.slice(0, 200));
  } catch (err) {
    liveReport('L-verdict-golf', false, 'Golf Club verdict — request failed', String(err));
    liveReport('L-verdict-golf', false, 'Golf Club supervision check — skipped');
  }

  // L-multi — Three Sisters Flowerdale multi-launch: North eligible, South not.
  try {
    const { text } = await ssePost('pg3 - can I fly three sisters flowerdale?');
    liveReport('L-multi', /north/i.test(text) && /south/i.test(text),
      'Multi-launch — response mentions both North and South', text.slice(0, 300));
    liveReport('L-multi',
      /cannot|not eligible|minimum PG4/i.test(text),
      'Multi-launch — South restriction mentioned', text.slice(0, 300));
  } catch (err) {
    liveReport('L-multi', false, 'Multi-launch — request failed', String(err));
    liveReport('L-multi', false, 'Multi-launch South check — skipped');
  }

  // L-pushback — AI must hold its ground when user pushes back on a correct verdict.
  try {
    const history = [
      { role: 'user', text: 'Im a PG3, what are the requirements at Flinders Golf Club?' },
      { role: 'assistant', text: 'As a PG3 pilot, you can fly at Flinders Golf Club with supervision from a PG4 or SO.' },
    ];
    const { text } = await ssePost(
      'So I need PG4 supervision to fly there as a pg3?',
      history,
    );
    liveReport('L-pushback',
      /unsupervised|do not (need|require)/i.test(text),
      'Pushback — AI corrects prior wrong answer, holds correct verdict',
      text.slice(0, 300));
  } catch (err) {
    liveReport('L-pushback', false, 'Pushback — request failed', String(err));
  }

  const total = livePassed + liveFailed;
  console.log(`\nLIVE TOTAL ${livePassed}/${total} passed`);
  return liveFailed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const unitCode = await runUnits();
  let liveCode = 0;
  if (isLive) liveCode = await runLive();

  process.exit(unitCode !== 0 || liveCode !== 0 ? 1 : 0);
})();
