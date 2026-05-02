import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

const dbPath = path.resolve(process.cwd(), "db.sqlite");
const sqliteDb = new Database(dbPath);

sqliteDb.pragma("journal_mode = WAL");

class PreparedStatement {
  private stmt: any;

  constructor(sql: string) {
    try {
      this.stmt = sqliteDb.prepare(sql);
    } catch (err: any) {
      log.error(`Failed to prepare: ${sql}`, err.message);
      throw err;
    }
  }

  get(...params: any[]): any {
    const flatParams = params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0]) ? params[0] : params;
    try {
      return this.stmt.get(flatParams);
    } catch (err: any) {
      log.error(`Query failed`, err.message);
      throw err;
    }
  }

  all(...params: any[]): any[] {
    const flatParams = params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0]) ? params[0] : params;
    try {
      return this.stmt.all(flatParams);
    } catch (err: any) {
      log.error(`Query failed`, err.message);
      throw err;
    }
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const flatParams = params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0]) ? params[0] : params;
    try {
      const info = this.stmt.run(flatParams);
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      };
    } catch (err: any) {
      log.error(`Query failed`, err.message);
      throw err;
    }
  }
}

// Simple mutex for async transactions
let txLock = Promise.resolve();

class SqliteDatabase {
  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(sql);
  }

  exec(sql: string): void {
    try {
      sqliteDb.exec(sql);
    } catch (err: any) {
      log.error(`Exec failed: ${sql.substring(0, 200)}`, err.message);
      throw err;
    }
  }

  transaction<T>(fn: (...args: any[]) => T | Promise<T>) {
    const wrapped = async (...args: any[]): Promise<T> => {
      let releaseLock: () => void;
      const acquireLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      const previousLock = txLock;
      txLock = txLock.then(() => acquireLock);

      await previousLock;

      try {
        sqliteDb.exec("BEGIN");
        const result = await fn(...args);
        sqliteDb.exec("COMMIT");
        return result;
      } catch (err) {
        if (sqliteDb.inTransaction) {
          sqliteDb.exec("ROLLBACK");
        }
        throw err;
      } finally {
        releaseLock!();
      }
    };
    return wrapped as any;
  }

  pragma(val: string): any {
    return sqliteDb.pragma(val);
  }

  close(): void {
    sqliteDb.close();
  }
}

const db = new SqliteDatabase();
export default db;
