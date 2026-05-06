import crypto from 'crypto';
import db from '../db.js';
import createLogger from './logger.js';
import { SESSION_TOKEN_LENGTH, SESSION_TTL_MS, SESSION_CLEANUP_INTERVAL_MS } from '../constants.js';

const log = createLogger('sessions');

export interface SessionToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class SessionManager {
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Generate a new session token
   */
  generateToken(userId: string, ipAddress?: string, userAgent?: string): SessionToken {
    const token = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    return {
      id: `sess-${crypto.randomBytes(8).toString('hex')}`,
      userId,
      token,
      expiresAt,
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent,
    };
  }

  /**
   * Create and store a new session
   */
  async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const session = this.generateToken(userId, ipAddress, userAgent);

    try {
      await db.prepare(`
        INSERT INTO sessions (id, userId, token, expiresAt, createdAt, lastActivity, ipAddress, userAgent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.userId,
        session.token,
        session.expiresAt.toISOString(),
        session.createdAt.toISOString(),
        session.lastActivity.toISOString(),
        session.ipAddress || null,
        session.userAgent || null
      );

      log.info(`Session created for user ${userId}`);
      return session.token;
    } catch (e: any) {
      log.error(`Failed to create session: ${e.message}`);
      throw e;
    }
  }

  /**
   * Validate and retrieve a session by token
   */
  async validateSession(token: string): Promise<SessionToken | null> {
    try {
      const row = await db.prepare(`
        SELECT id, userId, token, expiresAt, createdAt, lastActivity, ipAddress, userAgent
        FROM sessions
        WHERE token = ?
      `).get(token) as any;

      if (!row) {
        return null;
      }

      const expiresAt = new Date(row.expiresAt);
      const now = new Date();

      // Check if session has expired
      if (expiresAt < now) {
        log.info(`Session ${row.id} has expired, removing`);
        await this.destroySession(token);
        return null;
      }

      // Update last activity
      await db.prepare(`
        UPDATE sessions SET lastActivity = ? WHERE token = ?
      `).run(new Date().toISOString(), token);

      return {
        id: row.id,
        userId: row.userId,
        token: row.token,
        expiresAt,
        createdAt: new Date(row.createdAt),
        lastActivity: new Date(row.lastActivity),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      };
    } catch (e: any) {
      log.error(`Failed to validate session: ${e.message}`);
      return null;
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(token: string): Promise<boolean> {
    try {
      const result = await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      if (result.changes > 0) {
        log.info(`Session destroyed`);
        return true;
      }
      return false;
    } catch (e: any) {
      log.error(`Failed to destroy session: ${e.message}`);
      return false;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionToken[]> {
    try {
      const rows = await db.prepare(`
        SELECT id, userId, token, expiresAt, createdAt, lastActivity, ipAddress, userAgent
        FROM sessions
        WHERE userId = ? AND expiresAt > CURRENT_TIMESTAMP
        ORDER BY lastActivity DESC
      `).all(userId) as any[];

      return rows.map(row => ({
        id: row.id,
        userId: row.userId,
        token: row.token,
        expiresAt: new Date(row.expiresAt),
        createdAt: new Date(row.createdAt),
        lastActivity: new Date(row.lastActivity),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      }));
    } catch (e: any) {
      log.error(`Failed to get user sessions: ${e.message}`);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await db.prepare(`
        DELETE FROM sessions WHERE expiresAt < CURRENT_TIMESTAMP
      `).run();

      if (result.changes > 0) {
        log.info(`Cleaned up ${result.changes} expired sessions`);
      }

      return result.changes;
    } catch (e: any) {
      log.error(`Failed to cleanup sessions: ${e.message}`);
      return 0;
    }
  }

  /**
   * Start automatic cleanup of expired sessions
   */
  startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);

    log.info('Session cleanup scheduler started');
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.info('Session cleanup scheduler stopped');
    }
  }

  /**
   * Invalidate all sessions for a user (logout from all devices)
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    try {
      const result = await db.prepare(`
        DELETE FROM sessions WHERE userId = ?
      `).run(userId);

      log.info(`Invalidated ${result.changes} sessions for user ${userId}`);
      return result.changes;
    } catch (e: any) {
      log.error(`Failed to invalidate user sessions: ${e.message}`);
      return 0;
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Start cleanup scheduler on module load
sessionManager.startCleanupScheduler();

export default sessionManager;
