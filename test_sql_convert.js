import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the pgDb.ts file and extract the conversion functions
const pgDbContent = fs.readFileSync(path.join(__dirname, 'server/pgDb.ts'), 'utf-8');

// Extract just the conversion functions for testing
const functionsMatch = pgDbContent.match(/function quoteIdentifiersIfNeeded[\s\S]*?\n\}/);
const convertMatch = pgDbContent.match(/function convertSQL[\s\S]*?\n  return sql;\n\}/);

console.log('Testing SQL conversion:');
console.log('');

// Test SQL
const testSql = "SELECT id FROM contacts WHERE email = ? AND isAdmin = 1";
console.log('Input SQL:', testSql);
console.log('');

// Since we can't easily extract and run the functions, let's just test manually
const sql = testSql;
const keywords = /^(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|SET|VALUES|AND|OR|NOT|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|DISTINCT|CASE|WHEN|THEN|ELSE|END|IN|EXISTS|BETWEEN|LIKE|IS|NULL|TRUE|FALSE|DEFAULT|PRIMARY|KEY|FOREIGN|CONSTRAINT|INDEX|CREATE|DROP|ALTER|ADD|TABLE|VIEW|DATABASE|SCHEMA|COLLATE|CAST|CURRENT_TIMESTAMP|INTERVAL|EXTRACT|DATE|TIME|TIMESTAMP|NOW|CURRENT_DATE|CURRENT_TIME|INT|TEXT|BOOLEAN|REAL|SERIAL|CONFLICT|DO|NOTHING|EXCLUDED|USING|WITH|OVER|PARTITION|RECURSIVE|SUM|COUNT|AVG|MAX|MIN|COALESCE|SUBSTRING|POSITION|TRIM|UPPER|LOWER|LENGTH|ASC|DESC)$/i;

let result = sql.replace(/([=!<>]+|,|\(|\s)([a-zA-Z_][a-zA-Z0-9_]*)(?=[=!<>.,)\s]|$)/g, (match, before, identifier) => {
  console.log(`Match: "${match}" | Before: "${before}" | Identifier: "${identifier}"`);
  if (identifier.startsWith('"')) return match;
  if (keywords.test(identifier)) {
    console.log(`  -> Skip keyword: ${identifier}`);
    return match;
  }
  if (/[A-Z]/.test(identifier)) {
    console.log(`  -> Quote camelCase: ${identifier} -> "${identifier}"`);
    return `${before}"${identifier}"`;
  }
  console.log(`  -> No quote needed: ${identifier}`);
  return match;
});

console.log('');
console.log('Output SQL:', result);
