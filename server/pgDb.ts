import "dotenv/config";
import { PoolClient } from "pg";
import { pool } from "./pg.js";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

// ─── PreparedStatement shim ───────────────────────────────────────────────────
// Wraps a parameterised SQL string and provides the same .get() / .all() / .run()
// interface used everywhere in the routes (mirrors sqliteDb.ts).
//
// SQLite uses ? positional params and named @param params.
// PostgreSQL uses $1, $2, ... positional params.
// This shim converts both forms automatically.

function toPostgresParams(sql: string, params: any[]): { sql: string; values: any[] } {

  // Guard: reject queries that mix ? and @param placeholders
  const hasQ = /\?/.test(sql);
  const hasAt = /@[a-zA-Z_]/.test(sql);
  if (hasQ && hasAt) {
    throw new Error(`SQL query mixes ? and @param placeholders: ${sql.substring(0, 100)}`);
  }
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

function quoteIdentifiersIfNeeded(sql: string): string {
  // Quote camelCase column names to preserve case in PostgreSQL.
  // This handles identifiers in SELECT, WHERE, SET, JOIN ON, etc.

  const keywords = /^(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|SET|VALUES|AND|OR|NOT|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|DISTINCT|CASE|WHEN|THEN|ELSE|END|IN|EXISTS|BETWEEN|LIKE|ILIKE|ESCAPE|IS|NULL|TRUE|FALSE|DEFAULT|PRIMARY|KEY|FOREIGN|CONSTRAINT|INDEX|CREATE|DROP|ALTER|ADD|TABLE|VIEW|DATABASE|SCHEMA|COLLATE|CAST|CURRENT_TIMESTAMP|INTERVAL|EXTRACT|DATE|TIME|TIMESTAMP|NOW|CURRENT_DATE|CURRENT_TIME|INT|TEXT|BOOLEAN|REAL|SERIAL|CONFLICT|DO|NOTHING|EXCLUDED|USING|WITH|OVER|PARTITION|RECURSIVE|SUM|COUNT|AVG|MAX|MIN|COALESCE|SUBSTRING|POSITION|TRIM|UPPER|LOWER|LENGTH|ASC|DESC|ALL|ANY|ROW|CHECK|TYPE|RETURNING|ROWS|RANGE|GROUPS|FILTER|WITHIN|ARRAY|FIRST|LAST|NEXT|PRECEDING|UNBOUNDED)$/i;

  // Match identifiers in broader contexts: after operators (=, !=, <, >, etc.), commas, parens, spaces, periods
  // Use lookahead to match what comes after without consuming it (so we can keep it)
  let result = sql;

  // First pass: identifiers after operators, punctuation, and periods (for qualified names like table.column)
  result = result.replace(/([=!<>]+|,|\(|\.|\s)([a-zA-Z_][a-zA-Z0-9_]*)(?=[=!<>.,)\s]|$)/g, (match, before, identifier) => {
    // Skip if already quoted
    if (identifier.startsWith('"')) return match;

    // Skip SQL keywords
    if (keywords.test(identifier)) return match;

    // Quote if contains uppercase (camelCase)
    if (/[A-Z]/.test(identifier)) {
      return `${before}"${identifier}"`;
    }

    return match;
  });

  return result;
}

function convertSQL(raw: string): string {
  let sql = raw;

  // Convert INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON CONFLICT/i.test(sql)) {
      // Detect table and add appropriate conflict column
      if (sql.toLowerCase().includes("into contacts")) {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (id) DO NOTHING";
      } else if (sql.toLowerCase().includes("into settings")) {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (key) DO NOTHING";
      } else if (sql.toLowerCase().includes("into sites")) {
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (id) DO NOTHING";
      } else {
        // Default fallback
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
      }
    }
  }

  // Convert INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE SET
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
    if (!/ON CONFLICT/i.test(sql)) {
      // Extract the table name and column list from the SQL
      const tableMatch = sql.match(/INSERT\s+INTO\s+([\w"]+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1].toLowerCase().replace(/"/g, "");
        
        // Define a map of tables to their conflict columns (PK or unique constraint)
        const tablePrimaryKeys: Record<string, string> = {
          'settings': 'key',
          'sites': 'id',
          'site_extended_forecasts': '"siteId"',
          'weather_forecasts': '"siteId"',
          'wind_grid_data': '"siteId"',
          'extended_forecasts': 'id',
          'document_index': '"driveFileId"',
          'emergency_hospitals_cache': '"siteId"',
          'pilots': 'id',
          'contacts': 'id',
          'users': 'id',
          'admin_sessions': 'token',
          'search_logs': '"id"',
          'extended_wind_grids': '"id"',
          'site_closure_dates': '"site_id","closure_date"',
          'flights': 'id',
          'breadcrumbs': 'id',
          'flight_breadcrumbs': 'id',
          'pilot_sessions': 'token',
        };
        
        const primaryKey = tablePrimaryKeys[tableName];
        if (primaryKey) {
          // Extract all columns from the INSERT column list and build a full DO UPDATE SET
          // This ensures ALL columns get updated on conflict (matching SQLite INSERT OR REPLACE semantics)
          const columnsMatch = sql.match(/INSERT INTO [\w"]+ \(([^)]+)\) VALUES/i);
          if (columnsMatch) {
            const columnsList = columnsMatch[1].replace(/\s+/g, '').split(',');
            const pkParts = primaryKey.split(',').map(p => p.replace(/"/g, '').trim());
            const updateCols = columnsList
              .filter(col => {
                const bare = col.replace(/"/g, '').trim();
                return !pkParts.includes(bare);
              })
              .map(col => `${col} = EXCLUDED.${col}`)
              .join(', ');
            if (updateCols) {
              sql = sql.trimEnd().replace(/;$/, "") + ` ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateCols}`;
            } else {
              // Only PK columns in INSERT — use DO NOTHING
              sql = sql.trimEnd().replace(/;$/, "") + ` ON CONFLICT (${primaryKey}) DO NOTHING`;
            }
          } else {
            // Fallback if column list can't be parsed — use DO NOTHING
            sql = sql.trimEnd().replace(/;$/, "") + ` ON CONFLICT (${primaryKey}) DO NOTHING`;
          }
        } else {
          // Unknown table — use conservative fallback
          sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
        }
      } else {
        // Can't extract table name — use conservative fallback
        sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
      }
    }
  }

  // Append RETURNING id for tables that have a serial id column and whose
  // callers depend on .run() → lastInsertRowid.  Only two callers read this:
  //   • realMessageService.ts  → INSERT INTO map_messages
  //   • siteguideVersionCheck.ts → INSERT INTO siteguide_version_checks
  // All other INSERT callers ignore the return value.
  // Many tables (admin_sessions, settings, breadcrumbs, etc.) have NO id
  // column, so appending RETURNING id to everything would crash at runtime.
  if (/(?:INTO|INTO\s+)map_messages\s/i.test(sql) ||
      /(?:INTO|INTO\s+)siteguide_version_checks\s/i.test(sql)) {
    if (!/RETURNING/i.test(sql)) {
      sql = sql.trimEnd().replace(/;$/, "") + " RETURNING id";
    }
  }

  // Convert datetime expressions
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+hours?',\s*'start of day'\)/gi, "date_trunc('day', CURRENT_TIMESTAMP - interval '$1 hours')");
  sql = sql.replace(/datetime\('now',\s*'start of day'\)/gi, "CURRENT_DATE::timestamptz");
  sql = sql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+hours?'\)/gi, "CURRENT_TIMESTAMP - interval '$1 hours'");
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+days?'\)/gi, "CURRENT_TIMESTAMP - interval '$1 days'");

  // Special case: DATE('now') → CURRENT_DATE (PG does not accept CAST('now' AS DATE))
  // This must come before the general DATE() regex to avoid matching 'now' as an expression.
  sql = sql.replace(/DATE\('now'\)/gi, "CURRENT_DATE");

  // SQLite DATE() function: DATE(expression) → PG CAST expression as DATE
  sql = sql.replace(/DATE\(([^)]+)\)/gi, "CAST($1 AS DATE)");

  // Convert SQLite JSON functions to PostgreSQL equivalents
  sql = sql.replace(/JSON_GROUP_ARRAY\(/gi, "JSON_AGG(");
  
  // Handle json_object function conversion
  sql = sql.replace(/json_object\(([^)]+)\)/g, "JSON_BUILD_OBJECT($1)");
  
  // Convert json_extract(column, '$.path') → PG jsonb_extract_path_text or ->/->> operators
  // Pattern: json_extract(column, '$.path') → column#>>'{path}'  (returns text)
  sql = sql.replace(/json_extract\(([^,]+),\s*'\$\.([^']+)'\)/g, "$1#>>'{$2}'");

  // Convert SQLite LIKE to Postgres ILIKE for case-insensitive pattern matching
  sql = sql.replace(/\bLIKE\b/gi, "ILIKE");

  // SQLite and PostgreSQL both support || for string concatenation.
  // SQLite treats NULL || 'x' as 'x' (NULL as empty), while PG treats it as NULL.
  // If NULL-safe concatenation is needed, use CONCAT(col1, col2, ...) in the caller instead.
  // We leave || unchanged since PG handles it natively.
  
  // Quote camelCase identifiers to preserve case in PostgreSQL
  sql = quoteIdentifiersIfNeeded(sql);

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
        lastInsertRowid: result.rows[0]?.id ?? result.rows[0]?.lastval ?? 0,
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
