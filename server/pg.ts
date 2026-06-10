import "dotenv/config";
import { Pool, PoolClient, QueryResultRow } from "pg";
import createLogger from "./utils/logger.js";

const log = createLogger("pg");

// ─── Pool ─────────────────────────────────────────────────────────────────────
// Single shared pool for the whole server. Other modules MUST import this pool
// rather than constructing their own — Railway has a connection cap, and one
// pool keeps connection accounting predictable.

const poolMax = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 20;
const stmtTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT ?? "", 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: poolMax,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT_MS ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) : 60000,
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT_MS ? parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) : 10000,
  statement_timeout: Number.isFinite(stmtTimeoutMs) ? stmtTimeoutMs : 30000,
});

pool.on("error", (err) => {
  log.error("Postgres pool error:", err.message);
});

pool.on("connect", () => {
  if (pool.totalCount >= poolMax * 0.8) {
    log.warn(`Database connection pool at ${Math.round((pool.totalCount / poolMax) * 100)}% capacity (${pool.totalCount}/${poolMax})`);
  }
});

// ─── Query helpers ────────────────────────────────────────────────────────────
// Route/service code should call these directly. SQL is written in PostgreSQL
// syntax with $1, $2 positional parameters. CamelCase identifiers must be
// double-quoted in the SQL string ("safetyOfficerType") — Postgres folds
// unquoted identifiers to lowercase.

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  try {
    const result = await pool.query<T>(sql, params as unknown[]);
    return result.rows;
  } catch (err) {
    log.error(`query failed [${sql.substring(0, 120)}]:`, (err as Error).message);
    throw err;
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function execute(
  sql: string,
  params: readonly unknown[] = [],
): Promise<{ rowCount: number }> {
  try {
    const result = await pool.query(sql, params as unknown[]);
    return { rowCount: result.rowCount ?? 0 };
  } catch (err) {
    log.error(`execute failed [${sql.substring(0, 120)}]:`, (err as Error).message);
    throw err;
  }
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* rollback failure is secondary */ }
    throw err;
  } finally {
    client.release();
  }
}

export type { PoolClient };
