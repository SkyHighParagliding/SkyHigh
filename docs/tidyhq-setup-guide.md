# TidyHQ Integration Setup Guide

How to connect TidyHQ to the SkyHigh website for contact import, shop products, and automatic role sync.

---

## What It Does

| Feature | Required Secret | What It Does |
|---|---|---|
| Contact Import & Groups | `TIDYHQ_ACCESS_TOKEN` | Import contacts, browse groups, bulk-import members |
| Shop Products | `TIDYHQ_ACCESS_TOKEN` | Show TidyHQ shop products on the website |
| Webhook Role Sync | `TIDYHQ_WEBHOOK_SIGNING_KEY` | Auto-update roles when group membership changes in TidyHQ |

---

## Step 1: Get a TidyHQ Access Token

1. Log in at **https://skyhigh.tidyhq.com**
2. Go to **Administration → Developer → OAuth Applications** (or visit `https://dev.tidyhq.com`)
3. Create or open an application (name it `SkyHigh Website`, redirect URI can be `https://localhost`)
4. Go to **Access Tokens → Generate New Token**
5. Select scopes: `contacts`, `groups`, `shop` at minimum
6. Copy the token — it is only shown once

---

## Step 2: Set Up a Webhook

1. In TidyHQ, go to **Administration → Developer → Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **URL**: `https://your-app-domain.replit.app/api/tidyhq/webhook`
   - **Events**: `contact.group.added` and `contact.group.removed`
4. Copy the **Signing Key** that TidyHQ generates

---

## Step 3: Save Secrets in Replit

1. Open your Replit project → **Secrets** tab (lock icon)
2. Add both secrets:

| Key | Value |
|---|---|
| `TIDYHQ_ACCESS_TOKEN` | Access token from Step 1 |
| `TIDYHQ_WEBHOOK_SIGNING_KEY` | Signing key from Step 2 |

3. Restart the application

---

## Step 4: Configure Group Mappings

1. Log in as admin → **API Settings** page → scroll to **TidyHQ Group Sync**
2. Click **Add Mapping**
3. Select a TidyHQ group and assign a role:

| Role | Effect |
|---|---|
| **Committee** | Marks the contact as a committee member |
| **Safety Committee** | Marks as safety committee (shows on Safety page) |
| **Position Title** | Sets the contact's position to the group name (e.g. "President", "Treasurer") |
| **Contractor** | Marks as a contractor |
| **Parks Vic** | Marks as Parks Victoria contact |

4. Repeat for each group

**Position Title** is special — it uses the TidyHQ group name as the position label on the website (committee widget, About page). Map each named position group (President, Vice President, Secretary, Treasurer, etc.) with the **Position Title** role.

---

## Step 5: Verify

- **Access Token**: Admin → Contacts → Import from TidyHQ Group. You should see your groups listed.
- **Shop**: Visit the Shop page. Products appear if your TidyHQ org has them configured.
- **Webhook**: In TidyHQ, add a test contact to a mapped group. Check the Webhook Sync Log on the API Settings page — you should see the role applied.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "TidyHQ access token not configured" | Add `TIDYHQ_ACCESS_TOKEN` in Secrets and restart |
| Groups list is empty | Regenerate the token with `groups` scope |
| Webhook shows "No mapping configured" | Add a mapping for that group in TidyHQ Group Sync |
| Webhook returns 401 | Check `TIDYHQ_WEBHOOK_SIGNING_KEY` matches the key in TidyHQ |
| Contact not found after webhook | The contact's TidyHQ email must match an email in the SkyHigh contact directory. If no match, the system auto-creates the contact |

---

## Important Notes

- The webhook matches contacts by email address. Ensure TidyHQ contacts have the same email as their SkyHigh record.
- The Admin role can never be set via webhook — it must be assigned manually for security.
- When a contact is removed from a Position Title group, their position field is cleared.
- When a contact is removed from a Committee group, their committee flag and display settings are cleared.
- Shop product links point to `skyhigh.tidyhq.com`. Update `server/routes/shop.ts` if the subdomain changes.
