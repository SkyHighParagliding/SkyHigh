import pg from 'pg';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf-8');
const dbUrl = envFile.match(/DATABASE_URL="([^"]+)"/)?.[1];
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const result = await client.query(`DELETE FROM wind_grid_data WHERE "siteId" LIKE 'thermal_grid_%'`);
console.log(`Deleted ${result.rowCount} thermal grid cache rows`);
await client.end();
