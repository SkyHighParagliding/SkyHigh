import db from "../db.js";
import createLogger from "../utils/logger.js";
import type { MessageService, Pilot, MapMessage } from "./types.js";

const log = createLogger("map-messages");

const MAX_MESSAGE_LENGTH = 500;

async function purgeOldMessages() {
  try {
    const result = await db.prepare("DELETE FROM map_messages WHERE createdAt < datetime('now', '-24 hours')").run();
    if (result.changes > 0) {
      log.info(`Purged ${result.changes} expired map message(s)`);
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

    const result = await db
      .prepare(
        `INSERT INTO map_messages (senderPilotId, senderName, recipientPilotId, recipientName, message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        String(sender.id),
        sender.firstName || sender.name || "Pilot",
        String(recipientPilotId),
        String(recipientName || "Pilot"),
        trimmed
      );

    log.info(`Message sent: ${sender.firstName} → ${recipientName} (id: ${result.lastInsertRowid})`);

    return {
      id: result.lastInsertRowid as number,
      senderPilotId: String(sender.id),
      senderName: sender.firstName || sender.name || "Pilot",
      recipientPilotId: String(recipientPilotId),
      message: trimmed,
      createdAt: new Date().toISOString(),
    };
  }

  async getInbox(pilotId: string) {
    await purgeOldMessages();

    const messages = await db
      .prepare(
        `SELECT id, senderPilotId, senderName, recipientPilotId, recipientName,
                message, thumbsUp, createdAt, deliveredAt
         FROM map_messages
         WHERE recipientPilotId = ? AND deliveredAt IS NULL
         ORDER BY createdAt ASC
         LIMIT 50`
      )
      .all(pilotId);

    const thumbsUps = await db
      .prepare(
        `SELECT id, recipientPilotId, recipientName, thumbsUp, createdAt
         FROM map_messages
         WHERE senderPilotId = ? AND thumbsUp IN (1, 2) AND deliveredAt IS NULL
         ORDER BY createdAt DESC
         LIMIT 20`
      )
      .all(pilotId);

    return { messages, thumbsUps };
  }

  async thumbsUp(msgId: string | number, pilotId: string) {
    const msg = await db
      .prepare("SELECT id, recipientPilotId FROM map_messages WHERE id = ?")
      .get(msgId) as any;

    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not your message", status: 403 };

    await db.prepare("UPDATE map_messages SET thumbsUp = 1 WHERE id = ?").run(msgId);
    log.info(`Thumbs-up on message ${msgId}`);
    return { ok: true };
  }

  async thumbsDown(msgId: string | number, pilotId: string) {
    const msg = await db
      .prepare("SELECT id, recipientPilotId FROM map_messages WHERE id = ?")
      .get(msgId) as any;

    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not your message", status: 403 };

    await db.prepare("UPDATE map_messages SET thumbsUp = 2 WHERE id = ?").run(msgId);
    log.info(`Thumbs-down on message ${msgId}`);
    return { ok: true };
  }

  async markDelivered(msgId: string | number, pilotId: string) {
    const msg = await db
      .prepare("SELECT id, recipientPilotId, senderPilotId, thumbsUp FROM map_messages WHERE id = ?")
      .get(msgId) as any;

    if (!msg) return { ok: false, error: "Message not found", status: 404 };

    const isRecipient = msg.recipientPilotId === pilotId;
    const isSenderDismissingAck = msg.senderPilotId === pilotId && (msg.thumbsUp === 1 || msg.thumbsUp === 2);

    if (!isRecipient && !isSenderDismissingAck) {
      return { ok: false, error: "Not your message", status: 403 };
    }

    await db.prepare("UPDATE map_messages SET deliveredAt = CURRENT_TIMESTAMP WHERE id = ?").run(msgId);
    return { ok: true };
  }
}
