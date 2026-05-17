import Database from 'better-sqlite3';
const db = new Database('./data/skyhigh.db');

const sites = db.prepare('SELECT name, image FROM sites LIMIT 3').all();
console.log(JSON.stringify(sites, null, 2));
