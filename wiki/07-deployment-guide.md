---
name: Deployment Guide — Migration, Hosting, and Live Ops
description: Step-by-step procedures for deploying SkyHigh, migrating platforms, and managing live infrastructure
type: wiki
---

# Deployment Guide — Migration, Hosting, and Live Ops

## Overview

This file documents operational procedures for deploying SkyHigh, migrating between platforms, and managing live infrastructure. It complements `06-deployment.md` (environment URLs, credentials, live config).

---

## Firebase Migration — Moving from Google Sites to Firebase

**Status:** Procedure documented (not yet executed)  
**Context:** If SkyHigh transitions from Google Sites to Firebase hosting, use this guide to migrate while keeping the old site as a backup.

### Step 1: Deploy Your Site to Firebase (Temporary URL First)

Before touching DNS, get the new site live on a temporary Firebase URL for thorough testing.

1. **Create a Firebase project** in the [Firebase Console](https://console.firebase.google.com/)
2. **Install Firebase CLI** on your computer:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
3. **Initialize Hosting** in your website folder:
   ```bash
   firebase init hosting
   ```
   - Place your HTML/CSS files in the designated `public/` folder
4. **Deploy to Firebase:**
   ```bash
   firebase deploy
   ```
5. **Result:** Your site will be live at `https://your-project-id.web.app` — thoroughly test this before moving the domain.

### Step 2: Prepare the "Old" Google Site (Create a Backdoor)

To ensure you don't lose the old site, give it a "backdoor" address before moving the main domain.

1. **Open your Google Site editor**
2. **Navigate to:** Settings (gear icon) → Custom domains
3. **Current setup:** If `www.skyhighparagliding.org.au` is listed here, leave it for now
4. **Verify fallback access:** Ensure you can also access the site via its internal Google URL (e.g., `sites.google.com/view/skyhighparagliding`)
5. **Important:** Google Sites are tied to your Google Account. As long as you don't hit "Delete Site," the site exists forever—even if no domain points to it.

### Step 3: Connect Domain to Firebase (The Switch)

This is where you redirect the world to Firebase instead of Google Sites.

1. **In Firebase Console:** Go to Hosting → Add Custom Domain
2. **Enter your domain:** `www.skyhighparagliding.org.au`
3. **Get DNS Records:** Firebase will provide two "A" Records (IP addresses)
4. **Log in to your DNS provider** (where you registered the domain, e.g., GoDaddy)
5. **Update DNS:**
   - Find and **delete** the existing CNAME or A Record pointing to Google Sites
   - **Add the new A Records** provided by Firebase
6. **Expected wait:** DNS propagation can take 1–24 hours globally

### Step 4: SSL and Verification

- **SSL Certificate:** Firebase automatically provisions HTTPS once it detects DNS pointing to Firebase (usually ~1 hour after DNS update)
- **Verify migration:** Once live, visit `www.skyhighparagliding.org.au` to confirm

### Old Site Accessibility After Migration

**Yes, the old site remains accessible:**
- **New site:** Visit `www.skyhighparagliding.org.au` (now on Firebase)
- **Old site:** Visit the private Google Sites URL, e.g., `sites.google.com/view/skyhighparagliding` (unchanged)

**Why?** Google Sites uses shared IP addresses and only responds to the "Host Name" (the URL). You cannot visit a Google Site by typing an IP address; it requires the correct domain.

### Pro Tip: Clean Up After Migration

Once the new site is live:
1. Open Google Sites settings
2. **Remove the custom domain link** from `www.skyhighparagliding.org.au`
3. This prevents conflicts between platforms, even though DNS is the ultimate "boss" of where traffic routes

---

## Migration Checklist

| Task | Location | Owner |
|------|----------|-------|
| Upload files to Firebase | Firebase CLI / Console | Dev |
| Retrieve new A Records | Firebase Hosting tab | Dev |
| Update DNS records | Domain registrar (e.g., GoDaddy) | Admin |
| Verify new site live | Browser test: www.skyhighparagliding.org.au | QA |
| Remove old domain from Google Sites | Google Sites settings | Admin |
| Confirm old site still accessible | Browser: sites.google.com/view/... | QA |

---

## CLI vs. Drag-and-Drop

**Firebase CLI (Recommended for SkyHigh):**
- Full control, scriptable, integrates with CI/CD
- Required for this project's build pipeline
- Command: `firebase deploy`

**Drag-and-Drop Alternatives:**
- Vercel, Netlify, GitHub Pages (if you prefer no CLI)
- Not evaluated for SkyHigh yet; Firebase remains the plan

---

## References

- Firebase Hosting Docs: https://firebase.google.com/docs/hosting
- Google Sites Backup/Archive: https://support.google.com/sites/answer/7385926
- DNS Propagation Checker: https://www.whatsmydns.net/

---

Last updated: 2026-05-13
