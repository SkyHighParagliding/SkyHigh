---
tags: [sizzle, future, pricing]
status: idea — after the 2026 NTVO (not before 4 Nov 2026)
---

# Sizzle till: check prices at any Woolworths or Coles store

Researched 2026-10-23 (session 78). Jon: "do it after the event".

## Findings (from Jon's home connection, 23 Oct 2026)

- **Woolworths:** `GET /apis/ui/StoreLocator/Stores?Max=3&Division=SUPERMARKETS&postcode=3741` → Bright, StoreNo 3088 (works, no cookie). `POST /apis/ui/Search/products` works after a cookie from the home page; results include `Price`, `CupString`, `InstoreCupPrice`. `GET /apis/ui/product/detail/{stockcode}` hung (bot protection).
- **Coles:** Imperva on every page. Search works via the Next.js data route `/_next/data/<buildId>/en/search/products.json?q=…` (buildId from the home page HTML). Prices vary per store; third-party scrapers set the store by store id or nearest-to-postcode. Exact parameter not confirmed.
- No public API for either; terms of use not read (script-rendered) but likely prohibit automated access — a risk to weigh.
- Unknown: do these calls work from Railway's data-centre IPs? That decides the design.
- Paid fallback: Apify `clearpath/coles-scraper` (Coles only, ~$1–1.50 per 1,000 results, store ids or postcodes).
- Ordering: no ordering API; automation would need stored logins, one-time codes, a stored card, and break on site changes. Not recommended.

## Plan

0. **Spike (1–2 h):** from Railway, run a Woolworths and a Coles search, and get one store's prices as a guest. Choose: server / small checker on Jon's PC / Apify.
1. **Needs, not products:** each of the 27 items gets a spec (search words, size range, unit counting, must-haves). Current Woolworths products stay as the Bright matches.
2. **"Check prices" (Admin):** Woolworths or Coles → postcode or town → pick a store from the nearest list → saved on the event.
3. **Price run (server):** search each spec at that store, gently rate-limited; Gemini (structured JSON) picks the best match, units per pack, confidence, substitution flags. ~1–2 min with progress.
4. **Review:** old vs new price, match + link, confidence, flags; accept all or per row → event shelf prices; sell prices recalculate as now; manual sell prices kept.
5. **Docs:** shopping lists show the store and its product links.

Pick-up order: (A) a "trolley list" per store (items, quantities, links, aisles) in the till; (B) Claude in Chrome fills the trolley and picks the slot in Jon's own signed-in Edge, Jon checks and pays. Not (C) server automation with stored logins.

Estimate: spike S; steps 1–5 about 1–2 days. Gemini cost: cents per run.
