import pg from 'pg';
import { config } from 'dotenv';
config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const pool = new pg.Pool({ connectionString: dbUrl });

// Show all wind_grid_data rows
const rows = await pool.query(`
  SELECT "siteId" as sid, length("gridData"::text) as size
  FROM wind_grid_data
  ORDER BY "siteId" DESC LIMIT 20
`);
console.log('All wind_grid_data rows:');
for (const r of rows.rows) {
  console.log(`  ${r.sid} — size=${r.size}`);
}

// Show thermal grid settings
const settings = await pool.query(`
  SELECT key, value FROM settings WHERE key IN ('thermalGridLastRun', 'thermalGridLastResult', 'fineGridLastRun', 'fineGridLastResult')
`);
console.log('\nGrid settings:');
for (const r of settings.rows) {
  console.log(`  ${r.key} = ${r.value}`);
}

// Optionally reset thermalGridLastRun so tomorrow's cron runs (pass --reset flag)
if (process.argv.includes('--reset')) {
  await pool.query(`UPDATE settings SET value = '2000-01-01T00:00:00.000Z' WHERE key = 'thermalGridLastRun'`);
  await pool.query(`UPDATE settings SET value = 'no data — cron reset' WHERE key = 'thermalGridLastResult'`);
  console.log('\nReset thermalGridLastRun to 2000-01-01 so cron will run at 5:26am tomorrow.');
}

await pool.end();
