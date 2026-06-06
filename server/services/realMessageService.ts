import { query, queryOne, execute } from "../pg.js";
import createLogger from "../utils/logger.js";
import type { MessageService, Pilot, MapMessage } from "./types.js";
import { MAX_MESSAGE_LENGTH } from "../constants.js";

const log = createLogger("map-messages");

async function purgeOldMessages() {
  try {
    const result = await execute(
      "DELETE FROM map_messages WHERE \"createdAt\" < NOW() - INTERVAL '24 hours'"
    );
    if (result.rowCount > 0) {
      log.info(`Purged ${result.rowCount} expired map message(s)`);
    }
  } catch (err: any) {
    log.error("Failed to purge old messages:", err.message);
  }
}

export class RealMessageService implements MessageService {
  async sendMessage(sender: Pilot, recipientPilotId: string, recipientName: string, message: string): Promise<MapMessage | { error: string; status: number }> {
    if (!recipientPilotId || !message) {
      return { error: "recipientPilotId and message are required", status: 400 };
    }

    const trimmed = String(message).trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
      return { error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters`, status: 400 };
    }

    if (recipientPilotId === String(sender.id)) {
      return { error: "Cannot message yourself", status: 400 };
    }

    const rows = await query<{ id: number }>(
      `INSERT INTO map_messages ("senderPilotId", "senderName", "recipientPilotId", "recipientName", message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        String(sender.id),
        sender.firstName || sender.name || "Pilot",
        String(recipientPilotId),
        String(recipientName || "Pilot"),
        trimmed,
      ]
    );

    const newId = rows[0]?.id;
    log.info(`Message sent: ${sender.firstName} → ${recipientName} (id: ${newId})`);

    return {
      id: newId as number,
      senderPilotId: String(sender.id),
      senderName: sender.firstName || sender.name || "Pilot",
      recipientPilotId: String(recipientPilotId),
      message: trimmed,
      createdAt: new Date().toISOString(),
    };
  }

  async getInbox(pilotId: string) {
    await purgeOldMessages();

    const messages = await query(
      `SELECT id, "senderPilotId", "senderName", "recipientPilotId", "recipientName",
              message, "thumbsUp", "createdAt", "deliveredAt"
       FROM map_messages
       WHERE "recipientPilotId" = $1 AND "deliveredAt" IS NULL
       ORDER BY "createdAt" ASC
       LIMIT 50`,
      [pilotId]
    );

    const thumbsUps = await query(
      `SELECT id, "recipientPilotId", "recipientName", "thumbsUp", "createdAt"
       FROM map_messages
       WHERE "senderPilotId" = $1 AND "thumbsUp" IN (1, 2) AND "deliveredAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 20`,
      [pilotId]
    );

    return { messages, thumbsUps };
  }

  async thumbsUp(msgId: string | number, pilotId: string) {
    const msg = await queryOne<{ id: number; recipientPilotId: string }>(
      `SELECT id, "recipientPilotId" FROM map_messages WHERE id = $1::int`,
      [msgId]
    );

    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not your message", status: 403 };

    await execute(`UPDATE map_messages SET "thumbsUp" = 1 WHERE id = $1::int`, [msgId]);
    log.info(`Thumbs-up on message ${msgId}`);
    return { ok: true };
  }

  async thumbsDown(msgId: string | number, pilotId: string) {
    const msg = await queryOne<{ id: number; recipientPilotId: string }>(
      `SELECT id, "recipientPilotId" FROM map_messages WHERE id = $1::int`,
      [msgId]
    );

    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not your message", status: 403 };

    await execute(`UPDATE map_messages SET "thumbsUp" = 2 WHERE id = $1::int`, [msgId]);
    log.info(`Thumbs-down on message ${msgId}`);
    return { ok: true };
  }

  async markDelivered(msgId: string | number, pilotId: string) {
    const msg = await queryOne<{ id: number; recipientPilotId: string; senderPilotId: string; thumbsUp: number | null }>(
      `SELECT id, "recipientPilotId", "senderPilotId", "thumbsUp" FROM map_messages WHERE id = $1::int`,
      [msgId]
    );

    if (!msg) return { ok: false, error: "Message not found", status: 404 };

    const isRecipient = msg.recipientPilotId === pilotId;
    const isSenderDismissingAck = msg.senderPilotId === pilotId && (msg.thumbsUp === 1 || msg.thumbsUp === 2);

    if (!isRecipient && !isSenderDismissingAck) {
      return { ok: false, error: "Not your message", status: 403 };
    }

    await execute(`UPDATE map_messages SET "deliveredAt" = CURRENT_TIMESTAMP WHERE id = $1::int`, [msgId]);
    return { ok: true };
  }
}
