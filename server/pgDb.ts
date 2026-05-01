import pg from "pg";
import { AsyncLocalStorage } from "async_hooks";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  log.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  log.error("Unexpected PostgreSQL pool error:", err);
});

const txStorage = new AsyncLocalStorage<pg.PoolClient>();

function getClient(): pg.Pool | pg.PoolClient {
  return txStorage.getStore() || pool;
}

const SQL_KEYWORDS = new Set([
  "ABORT","ADD","ALL","ALTER","ANALYZE","AND","AS","ASC","ATTACH","AUTOINCREMENT",
  "BEGIN","BETWEEN","BY","CASCADE","CASE","CAST","CHECK","COALESCE","COLLATE",
  "COLUMN","COMMIT","CONFLICT","CONSTRAINT","COUNT","CREATE","CROSS","CURRENT",
  "CURRENT_DATE","CURRENT_TIME","CURRENT_TIMESTAMP","DATABASE","DEFAULT","DEFERRABLE",
  "DEFERRED","DELETE","DESC","DETACH","DISTINCT","DO","DROP","EACH","ELSE","END",
  "ESCAPE","EXCEPT","EXCLUDE","EXCLUSIVE","EXISTS","EXPLAIN","FAIL","FILTER","FIRST",
  "FOLLOWING","FOR","FOREIGN","FROM","FULL","GLOB","GROUP","GROUPS","HAVING","IF",
  "IGNORE","IMMEDIATE","IN","INDEX","INDEXED","INITIALLY","INNER","INSERT","INSTEAD",
  "INTERSECT","INTO","IS","ISNULL","JOIN","KEY","LAST","LEFT","LIKE","LIMIT",
  "MATCH","NATURAL","NO","NOT","NOTHING","NOTNULL","NULL","NULLS","OF","OFFSET",
  "ON","OR","ORDER","OTHERS","OUTER","OVER","PARTITION","PLAN","PRAGMA","PRECEDING",
  "PRIMARY","QUERY","RAISE","RANGE","RECURSIVE","REFERENCES","REGEXP","REINDEX",
  "RELEASE","RENAME","REPLACE","RESTRICT","RETURNING","RIGHT","ROLLBACK","ROW",
  "ROWS","SAVEPOINT","SELECT","SET","TABLE","TEMP","TEMPORARY","THEN","TIES","TO",
  "TRANSACTION","TRIGGER","UNBOUNDED","UNION","UNIQUE","UPDATE","USING","VACUUM",
  "VALUES","VIEW","VIRTUAL","WHEN","WHERE","WINDOW","WITH","WITHOUT",
  "INTEGER","TEXT","REAL","BLOB","NUMERIC","BOOLEAN","SERIAL","TIMESTAMPTZ",
  "VARCHAR","BIGINT","SMALLINT","FLOAT","DOUBLE","DECIMAL","DATE","TIME","TIMESTAMP",
  "INTERVAL","JSON","JSONB","UUID","BYTEA","CHAR",
  "SUM","AVG","MIN","MAX","TOTAL","ABS","LOWER","UPPER","LENGTH","SUBSTR",
  "TRIM","LTRIM","RTRIM","ROUND","RANDOM","HEX","ZEROBLOB","TYPEOF","QUOTE",
  "INSTR","UNICODE","CHAR_LENGTH","POSITION","SUBSTRING","OVERLAY","EXTRACT",
  "NOW","TRUE","FALSE","ILIKE","SIMILAR","ANY","SOME","ARRAY","UNNEST",
  "GENERATE_SERIES","STRING_AGG","ARRAY_AGG","ROW_NUMBER","RANK","DENSE_RANK",
  "GREATEST","LEAST","NULLIF","CONCAT","REPLACE","SPLIT_PART","REGEXP_REPLACE",
  "CONFLICT","EXCLUDED","NOTHING",
]);

function quoteCamelCaseIdentifiers(sql: string): string {
  let result = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && sql[j] !== "'") j++;
      result += sql.substring(i, j + 1);
      i = j + 1;
      continue;
    }
    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j++;
      result += sql.substring(i, j + 1);
      i = j + 1;
      continue;
    }
    if (sql[i] === '@' || sql[i] === '$') {
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      result += sql.substring(i, j);
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(sql[i])) {
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const word = sql.substring(i, j);
      if (/[A-Z]/.test(word) && !SQL_KEYWORDS.has(word.toUpperCase())) {
        result += `"${word}"`;
      } else {
        result += word;
      }
      i = j;
      continue;
    }
    result += sql[i];
    i++;
  }
  return result;
}

function convertSqliteToPostgres(sql: string): string {
  let result = sql;

  result = result.replace(
    /datetime\s*\(\s*'now'\s*,\s*'start of day'\s*\)/gi,
    "(CURRENT_DATE::timestamptz)"
  );
  result = result.replace(
    /datetime\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)'\s*\)/gi,
    (_, num, unit) => `(NOW() + INTERVAL '${num} ${unit}')`
  );
  result = result.replace(
    /datetime\s*\(\s*'now'\s*,\s*'-(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)'\s*\)/gi,
    (_, num, unit) => `(NOW() - INTERVAL '${num} ${unit}')`
  );
  result = result.replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()");

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(result)) {
    result = result.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(result)) {
      result = result.replace(/(VALUES\s*\([^)]*\))/i, "$1 ON CONFLICT DO NOTHING");
    }
  }

  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(result)) {
    result = convertInsertOrReplace(result);
  }

  result = result.replace(
    /CASE\s+WHEN\s+(\$\d+)\s+IS\s+NOT\s+NULL\s+AND\s+\1\s*!=\s*''(\s*AND\s+\1\s*!=\s*'([^']*)')?\s*THEN\s+\1\s+ELSE\s+(\w+)\s+END/gi,
    (match, param, _extraClause, extraLiteral, col) => {
      if (extraLiteral) {
        return `COALESCE(NULLIF(NULLIF(${param}::TEXT, ''), '${extraLiteral}'), ${col})`;
      }
      return `COALESCE(NULLIF(${param}::TEXT, ''), ${col})`;
    }
  );

  result = quoteCamelCaseIdentifiers(result);

  return result;
}

function extractBalancedParens(sql: string, startIdx: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startIdx; i < sql.length; i++) {
    if (sql[i] === '(') { if (depth === 0) start = i + 1; depth++; }
    if (sql[i] === ')') { depth--; if (depth === 0) return sql.substring(start, i); }
  }
  return '';
}

function convertInsertOrReplace(sql: string): string {
  const headerMatch = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(/i);
  if (!headerMatch) {
    return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
  }

  const table = headerMatch[1];
  const colsStart = headerMatch.index! + headerMatch[0].length - 1;
  const colsPart = extractBalancedParens(sql, colsStart);

  const valuesIdx = sql.toUpperCase().indexOf('VALUES', colsStart + colsPart.length);
  if (valuesIdx < 0) {
    return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
  }
  const valsStart = sql.indexOf('(', valuesIdx);
  const valsPart = extractBalancedParens(sql, valsStart);

  if (!colsPart || !valsPart) {
    return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
  }

  const fullMatch = sql.substring(headerMatch.index!, valsStart + valsPart.length + 2);
  const cols = colsPart.split(",").map((c) => c.trim());
  const vals = valsPart.split(",").map((v) => v.trim());

  const pkCol = cols[0];
  const updateCols = cols.slice(1);
  const updateVals = vals.slice(1);

  const updateSet = updateCols
    .map((col, idx) => {
      const qCol = /[A-Z]/.test(col) && !SQL_KEYWORDS.has(col.toUpperCase()) ? `"${col}"` : col;
      return `${qCol} = EXCLUDED.${qCol}`;
    })
    .join(", ");

  const qPk = /[A-Z]/.test(pkCol) && !SQL_KEYWORDS.has(pkCol.toUpperCase()) ? `"${pkCol}"` : pkCol;

  const qCols = cols.map((c) =>
    /[A-Z]/.test(c) && !SQL_KEYWORDS.has(c.toUpperCase()) ? `"${c}"` : c
  ).join(", ");

  const newSql = sql.replace(
    fullMatch,
    `INSERT INTO ${table} (${qCols}) VALUES (${valsPart}) ON CONFLICT (${qPk}) DO UPDATE SET ${updateSet}`
  );
  return newSql;
}

function convertNamedParams(
  sql: string,
  params: any
): { text: string; values: any[] } {
  const namedMatches = sql.match(/@(\w+)/g);
  if (namedMatches && params && typeof params === "object" && !Array.isArray(params)) {
    const values: any[] = [];
    let paramIndex = 0;
    const nameToIndex = new Map<string, number>();

    let text = sql.replace(/@(\w+)/g, (_, name) => {
      if (nameToIndex.has(name)) {
        return `$${nameToIndex.get(name)}`;
      }
      const val = params[name] !== undefined ? params[name] : null;
      values.push(val);
      const idx = ++paramIndex;
      nameToIndex.set(name, idx);
      return `$${idx}`;
    });
    text = text.replace(/\?/g, () => `$${++paramIndex}`);
    return { text, values };
  }

  let idx = 0;
  const text = sql.replace(/\?/g, () => `$${++idx}`);
  const values = Array.isArray(params) ? params : params !== undefined ? [params] : [];
  return { text, values };
}

function processQuery(sql: string, params: any): { text: string; values: any[] } {
  const { text: parameterized, values } = convertNamedParams(sql, params);
  const text = convertSqliteToPostgres(parameterized);
  return { text, values };
}

interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

class PreparedStatement {
  private sql: string;

  constructor(sql: string) {
    this.sql = sql;
  }

  async get(...params: any[]): Promise<any> {
    const flatParams =
      params.length === 1 &&
      typeof params[0] === "object" &&
      !Array.isArray(params[0])
        ? params[0]
        : params;
    const { text, values } = processQuery(this.sql, flatParams);
    try {
      const client = getClient();
      const result = await client.query(text, values);
      return result.rows[0] || undefined;
    } catch (err: any) {
      log.error(`Query failed: ${text}`, err.message);
      throw err;
    }
  }

  async all(...params: any[]): Promise<any[]> {
    const flatParams =
      params.length === 1 &&
      typeof params[0] === "object" &&
      !Array.isArray(params[0])
        ? params[0]
        : params;
    const { text, values } = processQuery(this.sql, flatParams);
    try {
      const client = getClient();
      const result = await client.query(text, values);
      return result.rows;
    } catch (err: any) {
      log.error(`Query failed: ${text}`, err.message);
      throw err;
    }
  }

  async run(...params: any[]): Promise<RunResult> {
    const flatParams =
      params.length === 1 &&
      typeof params[0] === "object" &&
      !Array.isArray(params[0])
        ? params[0]
        : params;
    const { text, values } = processQuery(this.sql, flatParams);
    try {
      const client = getClient();
      const result = await client.query(text, values);
      return {
        changes: result.rowCount ?? 0,
        lastInsertRowid: result.rows?.[0]?.id,
      };
    } catch (err: any) {
      log.error(`Query failed: ${text}`, err.message);
      throw err;
    }
  }
}

class PgDatabase {
  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(sql);
  }

  async exec(sql: string): Promise<void> {
    try {
      const converted = convertSqliteToPostgres(sql);
      const client = getClient();
      await client.query(converted);
    } catch (err: any) {
      log.error(`Exec failed: ${sql.substring(0, 200)}`, err.message);
      throw err;
    }
  }

  transaction<T>(fn: (...args: any[]) => T | Promise<T>) {
    const self = this;
    const wrapped = async (...args: any[]): Promise<T> => {
      const existingClient = txStorage.getStore();
      if (existingClient) {
        return await fn(...args);
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await txStorage.run(client, async () => {
          return await fn(...args);
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    };
    return wrapped;
  }

  pragma(_val: string): any {
    return [];
  }

  close(): void {
    pool.end();
  }

  get pool() {
    return pool;
  }
}

const db = new PgDatabase();
export default db;
export { pool };
