import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  const result = await client.query("SELECT id, name, email FROM users LIMIT 10");
  console.log("Users in database:");
  console.log(JSON.stringify(result.rows, null, 2));
} catch (err) {
  console.error("Error querying users:", err.message);
} finally {
  client.release();
  await pool.end();
}
