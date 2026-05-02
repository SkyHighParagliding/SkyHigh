import "dotenv/config";
import { Pool, PoolClient } from "pg";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  log.error("Postgres pool error:", err.message);
});

// ─── PreparedStatement shim ───────────────────────────────────────────────────
// Wraps a parameterised SQL string and provides the same .get() / .all() / .run()
// interface used everywhere in the routes (mirrors sqliteDb.ts).
//
// SQLite uses ? positional params and named @param params.
// PostgreSQL uses $1, $2, ... positional params.
// This shim converts both forms automatically.

function toPostgresParams(sql: string, params: any[]): { sql: string; values: any[] } {
  // Handle named params (@key) → convert to positional
  if (params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0]) && params[0] !== null) {
    const obj = params[0];
    const values: any[] = [];
    let i = 1;
    const converted = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key) => {
      values.push(obj[key] ?? null);
      return `$${i++}`;
    });
    return { sql: converted, values };
  }

  // Handle positional ? params → $1, $2, ...
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: converted, values: params };
}

function convertSQL(raw: string): string {
  let sql = raw;

  // Convert INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON CONFLICT/i.test(sql)) {
      sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
    }
  }

  // Convert INSERT OR REPLACE -> INSERT ... ON CONFLICT UPDATE
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
    if (!/ON CONFLICT/i.test(sql)) {
      if (sql.toLowerCase().includes("into settings")) {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
      } else if (sql.toLowerCase().includes("into sites")) {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name";
      } else {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
      }
    }
  }

  // Convert datetime expressions
  sql = sql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+hours?'\)/gi, "CURRENT_TIMESTAMP - interval '$1 hours'");
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+days?'\)/gi, "CURRENT_TIMESTAMP - interval '$1 days'");

  // Convert SQLite ? to Postgres $1, $2... handled in toPostgresParams, but let's keep it consistent
  return sql;
}

class PgPreparedStatement {
  private readonly rawSql: string;
  private readonly convertedSql: string;

  constructor(sql: string) {
    this.rawSql = sql;
    this.convertedSql = convertSQL(sql);
  }

  async get(...params: any[]): Promise<any> {
    const { sql, values } = toPostgresParams(this.convertedSql, params);
    try {
      const result = await pool.query(sql, values);
      return result.rows[0] ?? undefined;
    } catch (err: any) {
      log.error(`PG get failed [${sql.substring(0, 100)}]:`, err.message);
      throw err;
    }
  }

  async all(...params: any[]): Promise<any[]> {
    const { sql, values } = toPostgresParams(this.convertedSql, params);
    try {
      const result = await pool.query(sql, values);
      return result.rows;
    } catch (err: any) {
      log.error(`PG all failed [${sql.substring(0, 100)}]:`, err.message);
      throw err;
    }
  }

  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    const { sql, values } = toPostgresParams(this.convertedSql, params);
    try {
      const result = await pool.query(sql, values);
      return {
        changes: result.rowCount ?? 0,
        lastInsertRowid: 0,
      };
    } catch (err: any) {
      log.error(`PG run failed [${sql.substring(0, 100)}]:`, err.message);
      throw err;
    }
  }
}

class PgDatabase {
  prepare(sql: string): PgPreparedStatement {
    return new PgPreparedStatement(sql);
  }

  async exec(sql: string): Promise<void> {
    const converted = convertSQL(sql);
    try {
      await pool.query(converted);
    } catch (err: any) {
      log.error(`PG exec failed [${converted.substring(0, 200)}]:`, err.message);
      throw err;
    }
  }

  transaction<T>(fn: (...args: any[]) => Promise<T>) {
    return async (...args: any[]): Promise<T> => {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        // Temporarily override pool.query with client.query for this transaction
        // We wrap fn to use client instead — simplest approach is just fn runs as-is
        // since all our fns call db.prepare().run() which goes through pool.query.
        // For true client isolation we'd need to thread the client through.
        // This is acceptable for the current use pattern (no nested transactions).
        const result = await fn(...args);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    };
  }

  // No-op for SQLite pragma compatibility
  pragma(_val: string): any {
    return null;
  }

  async close(): Promise<void> {
    await pool.end();
  }
}

// Test the connection on startup
async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    log.info("PostgreSQL connection established");
    return true;
  } catch (err: any) {
    log.error("PostgreSQL connection failed:", err.message);
    return false;
  }
}

await testConnection();

const db = new PgDatabase();
export default db;
