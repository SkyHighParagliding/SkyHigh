---
title: Overnight live-weather polling (Q&A record)
date: 2026-11-14
tags: [decision, weather, scraper]
---

# Overnight live-weather polling: questions and answers

Kept for review, as Jon asked on 2026-11-14. Summary entry: DECISION-023 in [[03-decisions-log]].

## Jon's question (2026-11-14)

> We turned off overnight weather downloads to reduce the number of api calls and the file size
> increases in the database. I'm wondering if we should turn it back on, but reduce the number of
> calls in what is currently the off period. I think during the day we have a random schedule of
> 10-15 minutes between calls. Perhaps going to 1 call every 60 mins would not increase the load
> sufficiently to cause a problem?

## Claude's answer: yes, one poll an hour overnight

Production numbers checked on 2026-11-14 (read-only queries):

**Schedule before the change**
- Operating hours 5 am – 9 pm Melbourne time; nothing for the 8 hours outside them.
- Per-source daytime gaps (random between min and max): WU 14–15 min, FreeFlightWx 1–2 min,
  LiveWind / Davis / WDL / Western Port 5–10 min, BOM 10–20 min.
- 39 live stations: 18 LiveWind, 10 FreeFlightWx, 9 WU, 2 Western Port, 1 BOM, 1 Davis.

**Extra load from one poll an hour overnight**

| | Daytime now | Added overnight | Change |
|---|---|---|---|
| WU calls (key limit 1,500/day) | about 600/day | 72 | stays under half the limit |
| FreeFlightWx calls | about 6,400/day | 80 | +1% |
| LiveWind (one bulk call per poll) | about 130/day | 8 | small |
| Saved history rows | about 7,000/day | about 310 | +4–5% |

**Database size is not a concern.** `weather_history` keeps 48 hours (`HISTORY_RETENTION_HOURS`),
so it can't keep growing: 6.9 MB / 15,656 rows at the time, settling about 0.3 MB higher. The
446 MB total database is mostly other tables, not live readings.

**No extra forecast downloads.** Each scrape also re-extracts site forecasts from the cached wind
grid. That grid cache lasts 26 h and is refreshed by the 5 am job, so overnight scrapes don't
trigger Open-Meteo downloads.

**What it gives:** overnight wind on the history charts instead of a gap, and dawn station boxes
on the map less than an hour old.

**Side effects checked**
- Map "old" fade is at 90 min (`STALE_AFTER_MIN`), above the 60 min gap, so overnight boxes don't fade.
- The amber "possibly stuck" flag needs 4 identical windy readings at least 75 min apart. With hourly
  polls that means 3 h of exactly the same reading overnight: rare, and likely really stuck.

## Jon's go-ahead (2026-11-14)

> Go ahead, set it to run as described and push it when complete. Make your own decisions base on
> best judgment. Save the questions and answers in case we need to review, go and don't stop till
> completed and checked on production

## Judgement calls made while building it

1. **Setting:** `weatherScraperNightIntervalMin`, default 60 when the row is missing (no migration
   needed). 0 turns overnight polling off (the old behaviour). Edited on Admin → Scheduled Tasks →
   Live Weather Scraper ("Overnight interval (min)", 0–240).
2. **One rate for every source overnight.** Not per source: one hourly poll is cheap for all of
   them, and one setting is simpler.
3. **Small jitter kept.** Overnight gap is random between interval−5 and interval (55–60 min), in
   the same spirit as the daytime random gaps (no predictable pattern).
4. **First daytime poll on time.** An overnight gap is capped so the next poll lands 0–2 min after
   the operating start hour. Without this the first morning poll could be up to an hour late.
5. **"Run continuously" still wins.** When it's on, the daytime rate runs all night, as before.
6. **Manual "Fetch Now" unchanged.**
7. **Code split:** the schedule rule is a pure function in `server/scraperSchedule.ts` with
   `server/scraperSchedule.test.mjs` (`npm run test:scraperschedule`); `server/weather.ts` uses it.
8. **Melbourne time** now read with `hourCycle: 'h23'` (hour and minute), which avoids engines
   that report midnight as "24".
9. **Admin Weather page text** fixed: it said "every 15–30 minutes", which hasn't been true for a
   while. It now says each source's interval, and the overnight rate.
10. **Dev database left as it was:** dev has "Run continuously" on; it was switched off for one test
    run to see the overnight path and switched back.

## Checked on production

- **14 Nov, 11:28 pm** (deploy of `33bab81`): all 7 sources polled, saved 35 readings across 30
  sites, and each logged "Next fetch in 55–59 minutes (overnight rate)". The 12:25 am round ran too.
- **Night of 15–16 Nov:** readings every hour from 9 pm to 5 am (20–54 rows an hour against about
  430 an hour by day); daytime polling resumed at 5:00 am. Example poll times: Locksley Field (WU)
  21:01 22:01 22:57 23:57 00:53 01:48 02:44 03:44 04:45 05:00; Manny's (FreeFlightWx) hourly then
  every 2 min from 05:01.
- **One gap found:** LiveWind skipped its poll just after midnight (Portsea 23:03 → 01:02; same on
  the first night). Its turn fell during the wind-grid download that runs at about 12:02 am, and a
  poll that meets a grid download is skipped until the next normal gap, which overnight is an hour.
  **Fix (11):** a poll skipped for a grid download now retries in 3 minutes, day and night
  (`GRID_BUSY_RETRY_MIN` in `server/weather.ts`). Grid downloads take about a minute.
