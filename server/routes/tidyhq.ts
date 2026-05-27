import { Router } from "express";
import crypto from "crypto";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";

const log = createLogger("tidyhq");
const router = Router();

function generateId() {
  return `con-${Math.random().toString(36).substr(2, 9)}`;
}

router.post("/webhook", asyncHandler(async (req, res) => {
  const signingKey = process.env.TIDYHQ_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    log.error("Webhook received but TIDYHQ_WEBHOOK_SIGNING_KEY is not configured");
    return res.status(500).json({ error: "Webhook signing key not configured" });
  }

  const tidySig = req.headers["tidy-signature"] as string | undefined;
  if (!tidySig) {
    log.warn("Webhook received without tidy-signature header, rejecting");
    return res.status(401).json({ error: "Missing signature" });
  }

  const parts = tidySig.split(",").reduce((acc, part) => {
    const [key, ...rest] = part.split("=");
    acc[key] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts["t"];
  const v1Signature = parts["v1"];
  if (!timestamp || !v1Signature) {
    log.warn("Webhook signature missing timestamp or v1 hash");
    return res.status(401).json({ error: "Invalid signature format" });
  }

  const tsNum = parseInt(timestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!isNaN(tsNum) && Math.abs(nowSec - tsNum) > 300) {
    log.warn(`Webhook timestamp too old/future: ${tsNum} vs now ${nowSec}`);
    return res.status(401).json({ error: "Webhook timestamp expired" });
  }

  const rawBody = (req as any).rawBody;
  const body = rawBody || JSON.stringify(req.body);

  const webhookId = req.headers["tidy-webhook-id"] as string || "";

  const keys = [signingKey, Buffer.from(signingKey, 'base64')];
  const payloads = [
    `${webhookId}.${timestamp}.${body}`,
    `${timestamp}.${body}`,
    body,
  ];

  let verified = false;
  for (const key of keys) {
    for (const payload of payloads) {
      const expected = crypto
        .createHmac("sha256", key)
        .update(payload)
        .digest("hex");
      if (v1Signature.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expected))) {
        verified = true;
        break;
      }
    }
    if (verified) break;
  }

  if (!verified) {
    log.warn("Webhook signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = req.body;
  const eventType = payload.kind || payload.event || payload.type || "";

  log.info(`Webhook received: ${eventType}`);

  if (eventType === "contact.group.added" || eventType === "contact.group.removed") {
    const contactData = payload.data?.contact || payload.contact || {};
    const groupData = payload.data?.group || payload.group || {};

    const tidyhqContactId = String(contactData.id || "");
    const contactEmail = contactData.email_address || contactData.email || "";
    const contactName = contactData.first_name || contactData.display_name || "";
    const contactSurname = contactData.last_name || "";
    const tidyhqGroupId = String(groupData.id || "");
    const tidyhqGroupName = groupData.label || groupData.name || "";

    let mappings = await query<{ localRoleFlag: string }>(
      `SELECT "localRoleFlag" FROM tidyhq_group_mappings WHERE "tidyhqGroupId" = $1`,
      [tidyhqGroupId]
    );

    if (mappings.length === 0 && tidyhqGroupName) {
      mappings = await query<{ localRoleFlag: string }>(
        `SELECT "localRoleFlag" FROM tidyhq_group_mappings WHERE "tidyhqGroupName" = $1`,
        [tidyhqGroupName]
      );
      if (mappings.length > 0 && tidyhqGroupId) {
        log.info(`Matched group by name "${tidyhqGroupName}" (webhook ID ${tidyhqGroupId} differs from stored ID)`);
        try {
          await execute(
            `UPDATE tidyhq_group_mappings SET "tidyhqGroupId" = $1 WHERE "tidyhqGroupName" = $2`,
            [tidyhqGroupId, tidyhqGroupName]
          );
        } catch (e: any) {
          log.warn(`Failed to auto-update group ID for "${tidyhqGroupName}": ${e.message}`);
        }
      }
    }

    if (mappings.length === 0) {
      log.info(`No mapping found for group ${tidyhqGroupId} (${tidyhqGroupName}), skipping`);
      await execute(
        `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", action, detail)
         VALUES ($1, $2, $3, $4, 'skipped', 'No mapping configured for this group')`,
        [eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName]
      );
      return res.json({ status: "ok", action: "skipped" });
    }

    if (!contactEmail) {
      log.warn(`Webhook contact has no email, cannot match locally`);
      await execute(
        `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", action, detail)
         VALUES ($1, $2, $3, $4, 'skipped', 'Contact has no email address')`,
        [eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName]
      );
      return res.json({ status: "ok", action: "skipped" });
    }

    let localContact = await queryOne<{ id: string; name: string; surname: string }>(
      `SELECT id, name, surname FROM contacts WHERE LOWER(email) = LOWER($1)`,
      [contactEmail]
    );

    if (!localContact && eventType === "contact.group.added") {
      const id = generateId();
      await execute(
        `INSERT INTO contacts (id, name, surname, email) VALUES ($1, $2, $3, $4)`,
        [id, contactName, contactSurname, contactEmail]
      );
      localContact = { id, name: contactName, surname: contactSurname };
      log.info(`Auto-created local contact ${id} for ${contactEmail}`);
    }

    if (!localContact) {
      await execute(
        `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", action, detail)
         VALUES ($1, $2, $3, $4, 'skipped', 'Contact not found locally')`,
        [eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName]
      );
      return res.json({ status: "ok", action: "skipped" });
    }

    const flagValue = eventType === "contact.group.added" ? 1 : 0;
    const actionLabel = eventType === "contact.group.added" ? "role_added" : "role_removed";

    for (const mapping of mappings) {
      const validFlags = ["isCommittee", "isSafetyCommittee", "isContractor", "isParksVic"];

      // Direct safetyOfficerType dispatch — set/clear safetyOfficerType column
      if (mapping.localRoleFlag === "safetyOfficerType:SO" || mapping.localRoleFlag === "safetyOfficerType:SSO") {
        const soType = mapping.localRoleFlag.split(":")[1]; // "SO" or "SSO"
        const displayName = `${localContact.name}${localContact.surname ? ` ${localContact.surname}` : ""}`;
        if (eventType === "contact.group.added") {
          await execute(
            `UPDATE contacts SET "safetyOfficerType" = $1, "updatedAt" = NOW() WHERE id = $2`,
            [soType, localContact.id]
          );
        } else {
          await execute(
            `UPDATE contacts SET "safetyOfficerType" = NULL, "updatedAt" = NOW() WHERE id = $1`,
            [localContact.id]
          );
        }
        await execute(
          `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", "localContactId", "localContactName", "roleFlag", action, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName,
            localContact.id, displayName, mapping.localRoleFlag, actionLabel,
            `safetyOfficerType ${eventType === "contact.group.added" ? `set to ${soType}` : "cleared"} for ${displayName} via webhook`
          ]
        );
        log.info(`${actionLabel}: safetyOfficerType=${soType} for ${displayName}`);
        continue;
      }

      if (mapping.localRoleFlag === "isPosition") {
        const displayName = `${localContact.name}${localContact.surname ? ` ${localContact.surname}` : ""}`;
        if (eventType === "contact.group.added") {
          const current = await queryOne<{ position: string | null; isSafetyCommittee: number }>(
            `SELECT position, "isSafetyCommittee" FROM contacts WHERE id = $1`,
            [localContact.id]
          );
          const currentPos = (current?.position || "").trim();
          let newPosition: string;
          if (!currentPos || currentPos === "Committee") {
            newPosition = tidyhqGroupName;
          } else if (!currentPos.split(", ").includes(tidyhqGroupName)) {
            newPosition = `${currentPos}, ${tidyhqGroupName}`;
          } else {
            newPosition = currentPos;
          }
          await execute(
            `UPDATE contacts SET position = $1, "updatedAt" = NOW() WHERE id = $2`,
            [newPosition, localContact.id]
          );
        } else {
          const current = await queryOne<{ position: string | null; isCommittee: number }>(
            `SELECT position, "isCommittee" FROM contacts WHERE id = $1`,
            [localContact.id]
          );
          const currentPos = (current?.position || "").trim();
          const parts = currentPos.split(", ").map((p: string) => p.trim()).filter((p: string) => p && p !== tidyhqGroupName);
          const newPosition = parts.length > 0 ? parts.join(", ") : (current?.isCommittee ? "Committee" : null);
          await execute(
            `UPDATE contacts SET position = $1, "updatedAt" = NOW() WHERE id = $2`,
            [newPosition, localContact.id]
          );
        }
        await execute(
          `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", "localContactId", "localContactName", "roleFlag", action, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName,
            localContact.id, displayName, "isPosition", actionLabel,
            `Position ${flagValue ? "set to" : "removed"} "${tidyhqGroupName}" for ${displayName} via webhook`
          ]
        );
        log.info(`${actionLabel}: position "${tidyhqGroupName}" for ${displayName}`);
        continue;
      }

      if (!validFlags.includes(mapping.localRoleFlag)) continue;

      if (mapping.localRoleFlag === "isCommittee") {
        await execute(
          `UPDATE contacts SET "isCommittee" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [flagValue, localContact.id]
        );
      } else if (mapping.localRoleFlag === "isSafetyCommittee") {
        await execute(
          `UPDATE contacts SET "isSafetyCommittee" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [flagValue, localContact.id]
        );
      } else if (mapping.localRoleFlag === "isContractor") {
        await execute(
          `UPDATE contacts SET "isContractor" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [flagValue, localContact.id]
        );
      } else if (mapping.localRoleFlag === "isParksVic") {
        await execute(
          `UPDATE contacts SET "isParksVic" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [flagValue, localContact.id]
        );
      }

      if (mapping.localRoleFlag === "isCommittee") {
        if (flagValue === 1) {
          await execute(
            `UPDATE contacts SET "isAdmin" = 1 WHERE id = $1`,
            [localContact.id]
          );
          const current = await queryOne<{ position: string | null }>(
            `SELECT position FROM contacts WHERE id = $1`,
            [localContact.id]
          );
          const currentPos = (current?.position || "").trim();
          if (!currentPos) {
            await execute(
              `UPDATE contacts SET position = 'Committee' WHERE id = $1`,
              [localContact.id]
            );
          }
        } else {
          const current = await queryOne<{ position: string | null }>(
            `SELECT position FROM contacts WHERE id = $1`,
            [localContact.id]
          );
          const currentPos = (current?.position || "").trim();
          if (currentPos === "Committee") {
            await execute(
              `UPDATE contacts SET position = NULL WHERE id = $1`,
              [localContact.id]
            );
          }
        }
      }

      if (mapping.localRoleFlag === "isSafetyCommittee") {
        if (flagValue === 1) {
          await execute(
            `UPDATE contacts SET "displaySafety" = 1 WHERE id = $1`,
            [localContact.id]
          );
        } else {
          await execute(
            `UPDATE contacts SET "displaySafety" = 0 WHERE id = $1`,
            [localContact.id]
          );
        }
      }

      const displayName = `${localContact.name}${localContact.surname ? ` ${localContact.surname}` : ""}`;
      await execute(
        `INSERT INTO tidyhq_webhook_log ("eventType", "tidyhqContactId", "tidyhqGroupId", "tidyhqGroupName", "localContactId", "localContactName", "roleFlag", action, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName,
          localContact.id, displayName, mapping.localRoleFlag, actionLabel,
          `${mapping.localRoleFlag} ${flagValue ? "set" : "cleared"} for ${displayName} via webhook`
        ]
      );

      log.info(`${actionLabel}: ${mapping.localRoleFlag} for ${displayName}`);
    }

    return res.json({ status: "ok", action: actionLabel });
  }

  await execute(
    `INSERT INTO tidyhq_webhook_log ("eventType", action, detail) VALUES ($1, 'ignored', 'Unhandled event type')`,
    [eventType]
  );

  res.json({ status: "ok", action: "ignored" });
}));

router.get("/status", requireAuth, asyncHandler(async (_req, res) => {
  const hasToken = !!process.env.TIDYHQ_ACCESS_TOKEN;
  const hasSigningKey = !!process.env.TIDYHQ_WEBHOOK_SIGNING_KEY;
  const mappingCountResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tidyhq_group_mappings`
  );
  const mappingCount = mappingCountResult?.count ? parseInt(mappingCountResult.count, 10) : 0;
  const recentWebhooksResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tidyhq_webhook_log WHERE "createdAt" > NOW() - INTERVAL '7 days'`
  );
  const recentWebhooks = recentWebhooksResult?.count ? parseInt(recentWebhooksResult.count, 10) : 0;

  res.json({
    hasToken,
    hasSigningKey,
    mappingCount,
    recentWebhooks,
    connected: hasToken && hasSigningKey,
  });
}));

router.post("/test-connection", requireAuth, asyncHandler(async (_req, res) => {
  if (!process.env.TIDYHQ_ACCESS_TOKEN) {
    return res.json({ ok: false, message: "TIDYHQ_ACCESS_TOKEN is not set in environment secrets" });
  }
  try {
    const r = await tidyhqFetch("/organization");
    if (r.ok) {
      const data = await r.json() as any;
      return res.json({ ok: true, message: `Connected to TidyHQ organisation: ${data.name || data.id || "OK"}` });
    }
    if (r.status === 401) {
      return res.json({ ok: false, message: "Invalid API token — TidyHQ returned 401 Unauthorised" });
    }
    return res.json({ ok: false, message: `TidyHQ API returned status ${r.status}` });
  } catch (e: any) {
    return res.json({ ok: false, message: e.name === "AbortError" ? "Connection timed out (10s)" : `Connection failed: ${e.message}` });
  }
}));

router.get("/group-mappings", requireAuth, asyncHandler(async (req, res) => {
  const mappings = await query(
    `SELECT * FROM tidyhq_group_mappings ORDER BY "tidyhqGroupName" ASC`
  );
  res.json(mappings);
}));

router.post("/group-mappings", requireAuth, asyncHandler(async (req, res) => {
  const { tidyhqGroupId, tidyhqGroupName, localRoleFlag } = req.body;
  if (!tidyhqGroupId || !tidyhqGroupName || !localRoleFlag) {
    return res.status(400).json({ error: "tidyhqGroupId, tidyhqGroupName, and localRoleFlag are required" });
  }

  const validFlags = ["isCommittee", "isSafetyCommittee", "isContractor", "isParksVic", "isPosition", "safetyOfficerType:SO", "safetyOfficerType:SSO"];
  if (!validFlags.includes(localRoleFlag)) {
    return res.status(400).json({ error: `Invalid role flag. Must be one of: ${validFlags.join(", ")}` });
  }

  try {
    await execute(
      `INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag") VALUES ($1, $2, $3)`,
      [tidyhqGroupId, tidyhqGroupName, localRoleFlag]
    );
    res.status(201).json({ status: "ok" });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint") || e.message?.includes("duplicate key")) {
      return res.status(409).json({ error: "This group-to-role mapping already exists" });
    }
    throw e;
  }
}));

router.delete("/group-mappings/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute(
    `DELETE FROM tidyhq_group_mappings WHERE id = $1`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Mapping not found" });
  res.json({ status: "ok" });
}));

router.get("/webhook-log", requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const logs = await query(
    `SELECT * FROM tidyhq_webhook_log ORDER BY "createdAt" DESC LIMIT $1`,
    [limit]
  );
  res.json(logs);
}));

router.get("/callback", asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  const clientId = process.env.TIDYHQ_CLIENT_ID;
  const clientSecret = process.env.TIDYHQ_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("TIDYHQ_CLIENT_ID and TIDYHQ_CLIENT_SECRET must be set");
  }

  const baseUrl = process.env.APP_URL || "http://localhost:5173";
  const redirectUri = `${baseUrl}/api/tidyhq/callback`;

  try {
    const tokenRes = await fetch("https://accounts.tidyhq.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      log.error(`OAuth token exchange failed: ${tokenRes.status} ${errText}`);
      return res.status(400).send(`Token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json() as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(400).send("No access_token in response");
    }

    log.info("TidyHQ OAuth token obtained successfully");
    res.send(`
      <html>
        <head><title>TidyHQ Connected</title></head>
        <body style="font-family: system-ui; max-width: 600px; margin: 60px auto; text-align: center;">
          <h2 style="color: #059669;">TidyHQ Connected Successfully!</h2>
          <p>Your access token has been obtained. Copy the token below and update the <strong>TIDYHQ_ACCESS_TOKEN</strong> environment variable in Railway:</p>
          <textarea style="width: 100%; height: 80px; font-family: monospace; font-size: 12px; padding: 8px;" readonly onclick="this.select()">${accessToken}</textarea>
          <p style="color: #666; font-size: 14px; margin-top: 16px;">After updating the secret, restart the application and test the connection again.</p>
        </body>
      </html>
    `);
  } catch (e: any) {
    log.error(`OAuth callback error: ${e.message}`);
    res.status(500).send(`OAuth error: ${e.message}`);
  }
}));

export default router;
