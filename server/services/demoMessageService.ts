import createLogger from "../utils/logger.js";
import type { MessageService, Pilot, MapMessage } from "./types.js";
import { MAX_MESSAGE_LENGTH } from "../constants.js";

const log = createLogger("demo-messages");

interface DemoMapMessage {
  id: number;
  senderPilotId: string;
  senderName: string;
  recipientPilotId: string;
  recipientName: string;
  message: string;
  thumbsUp: number;
  delivered: number;
  createdAt: string;
}

export class DemoMessageService implements MessageService {
  readonly messages: DemoMapMessage[] = [];
  private msgIdCounter = 1;

  async sendMessage(sender: Pilot, recipientPilotId: string, recipientName: string, message: string): Promise<MapMessage | { error: string; status: number }> {
    if (!recipientPilotId || !message) {
      return { error: "Missing recipientPilotId or message", status: 400 };
    }
    const trimmed = (message || "").trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
      return { error: "Message must be 1-500 characters", status: 400 };
    }
    if (recipientPilotId === sender.id) {
      return { error: "Cannot message yourself", status: 400 };
    }

    this.purgeDemoMessages();

    const msg: DemoMapMessage = {
      id: this.msgIdCounter++,
      senderPilotId: sender.id,
      senderName: sender.name || sender.firstName || "Unknown",
      recipientPilotId,
      recipientName: recipientName || "Unknown",
      message: trimmed,
      thumbsUp: 0,
      delivered: 0,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(msg);

    return {
      id: msg.id,
      senderPilotId: msg.senderPilotId,
      senderName: msg.senderName,
      recipientPilotId: msg.recipientPilotId,
      message: msg.message,
      createdAt: msg.createdAt,
    };
  }

  async getInbox(pilotId: string): Promise<{ messages: any[]; thumbsUps: any[] }> {
    this.purgeDemoMessages();

    const messages = this.messages
      .filter(m => m.recipientPilotId === pilotId && !m.delivered)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 50)
      .map(m => ({
        id: m.id,
        senderPilotId: m.senderPilotId,
        senderName: m.senderName,
        recipientPilotId: m.recipientPilotId,
        recipientName: m.recipientName,
        message: m.message,
        thumbsUp: m.thumbsUp,
        createdAt: m.createdAt,
        deliveredAt: null,
      }));

    const thumbsUps = this.messages
      .filter(m => m.senderPilotId === pilotId && (m.thumbsUp === 1 || m.thumbsUp === 2) && !m.delivered)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map(m => ({
        id: m.id,
        recipientPilotId: m.recipientPilotId,
        recipientName: m.recipientName,
        thumbsUp: m.thumbsUp,
        createdAt: m.createdAt,
      }));

    return { messages, thumbsUps };
  }

  async thumbsUp(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }> {
    const id = typeof msgId === 'string' ? parseInt(msgId) : msgId;
    const msg = this.messages.find(m => m.id === id);
    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not the recipient", status: 403 };
    msg.thumbsUp = 1;
    return { ok: true };
  }

  async thumbsDown(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }> {
    const id = typeof msgId === 'string' ? parseInt(msgId) : msgId;
    const msg = this.messages.find(m => m.id === id);
    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId !== pilotId) return { ok: false, error: "Not the recipient", status: 403 };
    msg.thumbsUp = 2;
    return { ok: true };
  }

  async markDelivered(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }> {
    const id = typeof msgId === 'string' ? parseInt(msgId) : msgId;
    const msg = this.messages.find(m => m.id === id);
    if (!msg) return { ok: false, error: "Message not found", status: 404 };
    if (msg.recipientPilotId === pilotId) {
      msg.delivered = 1;
    } else if (msg.senderPilotId === pilotId && (msg.thumbsUp === 1 || msg.thumbsUp === 2)) {
      msg.delivered = 1;
    } else {
      return { ok: false, error: "Not authorized", status: 403 };
    }
    return { ok: true };
  }

  clear() {
    this.messages.length = 0;
    this.msgIdCounter = 1;
  }

  private purgeDemoMessages() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (new Date(this.messages[i].createdAt).getTime() < cutoff) {
        this.messages.splice(i, 1);
      }
    }
  }
}
