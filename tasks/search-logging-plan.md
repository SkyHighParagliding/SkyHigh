# Search Query & Response Logging — Saved Plan

## Database
New migration adding one table:
```
search_logs (id, search_type, query, response, created_at)
search_type = 'public' | 'admin'
```
Three new settings keys:
- `searchLoggingEnabled` — on/off toggle (default: false)
- `searchLogSizeWarningMb` — size threshold for email alert (default: 10)
- `searchLogWarningSent` — prevents repeat emails until logs are cleared

## Backend (new router `/api/search-logs`)
- **Write** — after each public or admin search completes, if `searchLoggingEnabled = true`,
  insert query + full response into `search_logs`. Check estimated size after every write.
  If total > `searchLogSizeWarningMb`, send one email to web@skyhighparagliding.org.au
  and set `searchLogWarningSent = true`. Won't repeat until logs are cleared.
- `GET /api/search-logs` — requireAuth, paginated, filterable by type
- `DELETE /api/search-logs` — requireAuth, clear all + reset `searchLogWarningSent`
- `GET /api/search-logs/stats` — requireAuth, count + estimated size + oldest entry date

Size estimation: `SELECT SUM(LENGTH(query) + LENGTH(response)) FROM search_logs`
Works on both SQLite and PostgreSQL.

## Frontend — placement
Add to existing Smart Assistant card at /admin/connections#smart-assistant:

**A) Logging controls (inline in card):**
- Toggle: "Log search queries and responses" (on/off)
- Status line: "X entries — approx Y MB — oldest: date" (or "Logging disabled")
- Button: "Review Logs →" (opens modal)

**B) Log viewer modal (full-screen overlay):**
- Filter tabs: All / Public / Admin
- Table: timestamp | type badge | query | response (truncated ~100 chars, click to expand)
- Pagination (50 per page)
- Stats bar: total entries, size, oldest entry
- "Clear All Logs" button with confirmation dialog
- Clearing resets searchLogWarningSent so next growth cycle triggers a fresh alert

## Email warning
Reuses existing email infrastructure (submissions system).
One email per log cycle to web@skyhighparagliding.org.au.
Subject: "SkyHigh Smart Search log needs review"
Body: current entry count and size estimate.
Clearing the log resets the flag.

## Workflow this enables
1. Enable logging before a test period
2. Bad answer reported → Review Logs → find query/response → identify issue → fix prompt/rules
3. Clear the log
4. Re-enable for next period
5. If forgotten, email arrives before it becomes a storage problem

## Scope
- 1 migration (search_logs table)
- 1 new route file (/api/search-logs)
- Changes to search.ts (write after each query)
- Changes to useConnectionsConfig.ts + AdminConnections.tsx (toggle + modal)
- No new pages or nav entries needed
