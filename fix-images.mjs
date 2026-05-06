#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database', 'db.sqlite');

const db = new Database(dbPath);

function getRandomImageFromLibrary(siteType) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get();
    if (!row?.value) return null;

    const images = JSON.parse(row.value);
    if (images.length === 0) return null;

    const typeStr = (siteType || '').toLowerCase();
    const isInland = typeStr.includes('inland') || typeStr.includes('mountain') || typeStr.includes('ridge') || typeStr.includes('tow');
    const category = isInland ? 'inland' : 'coastal';

    const matched = images.filter(img => img.banner && img.category === category);
    const pool = matched.length > 0 ? matched : images.filter(img => img.banner);

    if (pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)].banner || null;
  } catch (e) {
    console.error('Error getting random image:', e.message);
    return null;
  }
}

function isStaleImage(image) {
  if (!image || image.trim() === '') return true;

  // Any /uploads/ path is stale since those files don't exist anymore
  if (image.startsWith('/uploads/')) return true;

  const stalePhrases = ['site-709b3754dba7e1c8', 'placeholder', 'broken', '404'];
  return stalePhrases.some(phrase => image.toLowerCase().includes(phrase));
}

console.log('🔍 Fixing stale site images...\n');

const sites = db.prepare('SELECT id, name, type, image FROM sites').all();
console.log(`Found ${sites.length} sites to check\n`);

let updated = 0;
let failed = 0;
let skipped = 0;

for (const site of sites) {
  const stale = isStaleImage(site.image);

  if (!stale) {
    console.log(`⏭️  SKIP: ${site.id} (${site.name}) - image is fine`);
    skipped++;
    continue;
  }

  const newImage = getRandomImageFromLibrary(site.type);
  if (!newImage) {
    console.log(`❌ FAIL: ${site.id} (${site.name}) - no image available in library`);
    failed++;
    continue;
  }

  try {
    db.prepare('UPDATE sites SET image = ? WHERE id = ?').run(newImage, site.id);
    console.log(`✅ UPDATE: ${site.id} (${site.name})`);
    console.log(`   OLD: ${site.image}`);
    console.log(`   NEW: ${newImage}\n`);
    updated++;
  } catch (e) {
    console.log(`❌ ERROR: ${site.id} - ${e.message}`);
    failed++;
  }
}

console.log('\n📊 Summary:');
console.log(`   ✅ Updated:  ${updated}`);
console.log(`   ❌ Failed:   ${failed}`);
console.log(`   ⏭️  Skipped:  ${skipped}`);
console.log(`   📈 Total:    ${sites.length}`);

db.close();
process.exit(failed > 0 ? 1 : 0);
