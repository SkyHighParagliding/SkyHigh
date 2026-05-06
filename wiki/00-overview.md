---
name: Overview — What is SkyHigh?
description: Project mission, goals, scope, what it is and is not, and current feature set
type: wiki
---

# Overview — What is SkyHigh?

## Mission

SkyHigh is a **white-labellable club management platform for Australian paragliding and hang gliding clubs**. It combines real-time weather data, live GPS flight tracking, pilot retrieval coordination, administrative CMS, and AI-powered content management into one integrated system.

Built for **club committees** (not individual pilots) to manage site information, track members' XC flights, coordinate emergency retrieval, publish weather updates, and maintain documentation.

## 6 Primary Goals

### 1. Site Directory with Live Weather
- Browse launch and landing zones across Australia
- Real-time wind speed, direction, and gust via bilinear interpolation from continental ECMWF grids
- Animated wind vectors on interactive map (Canvas + D3)
- Site guides linked from siteguide.org.au and stored locally

### 2. XC Flight Tracking
- Pilots submit GPS traces (Garmin MapShare, SPOT, Zoleo, or manual upload)
- Automated processing: distance calculation, airspace violation detection, retrieval location detection
- Flight history searchable by pilot, date, and distance
- Map visualization of flight paths

### 3. Pilot Retrieval Coordination
- Server-Sent Events (SSE) for real-time chat and status updates
- Location sharing and live map during retrieval operations
- Safety Officer (SO) and retrieval team messaging
- Persistent conversation history

### 4. Admin CMS
- Add/edit/delete sites with photos, contacts, procedures, hazards
- Manage site guides (upload, link to external, generate Gemini summaries)
- User role management (Pilot, Safety Officer, Admin, Committee)
- TidyHQ webhook sync for automatic membership updates
- Session-token admin authentication with CSRF protection

### 5. TidyHQ Integration
- Automatic sync of contacts (name, email, phone, roles) from TidyHQ membership database
- Role-based access control (who can view retrieval chat, submit flights, edit sites)
- Admin can trigger manual sync or set up webhooks

### 6. AI-Powered Tools
- **Site Scraper:** Gemini fetches and summarizes external site guides
- **Image Enhancement:** Auto-caption and moderation of user-submitted photos
- **Content Generation:** Draft procedures, safety notes, and contact lists
- **Moderation:** Flag inappropriate image submissions for admin review

---

## What SkyHigh IS

✅ A **club management platform** — operated by a single club's committee  
✅ **White-label ready** — club name, logo, and branding can be customized per deployment  
✅ **Real-time** — SSE for live retrieval chat, live wind data updates  
✅ **Offline-friendly** — frontend works without server (cached data, localStorage settings)  
✅ **Mobile-first** — responsive design, works on phones and tablets  
✅ **AI-assisted** — Gemini for content, not a replacement for human judgment  
✅ **Data-persistent** — All flights, sites, and conversations stored permanently  

---

## What SkyHigh IS NOT

❌ A **social network** — no pilot profiles, no posts, no comments or ratings  
❌ A **booking system** — does not manage launch slot reservations or tandem bookings  
❌ A **logbook** — pilots manage their own flight history externally; SkyHigh just tracks XC submissions  
❌ An **e-commerce platform** — no memberships, donations, or merchandise sales (TidyHQ handles membership)  
❌ A **weather forecasting tool** — displays live ECMWF wind; does not generate forecasts  
❌ **Multi-tenant SaaS** — one deployment = one club; no central operator managing 100 clubs  
❌ A **replacement for Procedures Manual** — aids in creation and distribution but doesn't enforce compliance  
❌ An **emergency alert system** — no SMS/push notifications; uses SSE (browser-based) for retrieval chat  

---

## Current In-Scope Features

### Sites Module
- Browse all sites (launch + landing zones)
- Filter by state/region
- View wind speed, direction, gust at each site
- Access site guide (PDF, web link, or Gemini-generated summary)
- Contact information (SO, retrieval lead, emergency)
- Safety procedures and hazards

### Wind Map
- Continental grid view (Victoria 0.35° spacing, Wide 2.0° spacing)
- Animated wind vectors via Canvas particle system
- Zoom/pan with D3 mathematics
- Admin-configurable default viewport (center point + zoom level)
- Real-time data from pre-cached ECMWF grids (fetched daily 5:00/5:13am Melbourne)

### Admin Dashboard
- Manage sites (CRUD)
- Upload hero images for sites
- Bulk import hero images from folder
- Sync TidyHQ contacts (manual or webhook-triggered)
- View scheduled job status (grid fetch history, next fetch time)
- Manually trigger grid updates
- Session management (logout, change password)

### XC Flight Tracking
- Submit GPS flight (Garmin MapShare, SPOT, Zoleo, or file upload)
- Automatic distance and airspace calculation
- Flight history view (all submissions, or filtered by date range)
- Search and sort

### Retrieval Coordination
- Real-time SSE chat during operations
- Location sharing (pilot and retrieval team)
- Status updates (pilot OK, ETA, location change)
- Conversation history stored permanently

---

## Out-of-Scope Features

These have been explicitly decided **not** to build:
- Pilot individual accounts and profiles
- Social features (following, messaging, notifications)
- Booking/slot reservation system
- Advanced flight analysis (climb rate, turn rate, optimization)
- SMS/push notifications (SSE only)
- Automatic emergency escalation (human-triggered only)
- Weather forecasting (display only)
- Integration with other LMS systems
- Multi-club management from single deployment

---

## Domain Context

**Paragliding (PG) / Hang Gliding (HG)** are unpowered sports where pilots launch from hills or tow systems and ride thermal and ridge lift to gain altitude. **XC (Cross-Country) flying** means flying away from the launch site to distance goals. **Retrieval** is the logistical challenge of collecting a pilot from their landing zone.

**Australian clubs** are volunteer-run, typically 20–100 active members, with committee roles (President, Treasurer, Safety Officer, Site Warden). Information is critical: wind conditions, site contact details, emergency procedures, and flight tracking.

---

Last updated: 2026-05-06
