import fs from 'fs';
import path from 'path';
import { parse } from 'acorn';
// Use a try to find files with top-level await

function searchDir(dir) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (count > 5) return count;
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        count += searchDir(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('await')) {
            // Try to parse with acorn
            try {
              parse(content, { ecmaVersion: 2022, sourceType: 'module' });
            } catch {
              // Already found issue - backup.js
            }
          }
        } catch {}
      }
    }
  } catch {}
  return count;
}

const report = [
  ['node_modules/better-sqlite3/lib/methods/backup.js', fs.readFileSync('node_modules/better-sqlite3/lib/methods/backup.js', 'utf-8')],
  ['node_modules/better-sqlite3/lib/database.js', fs.readFileSync('node_modules/better-sqlite3/lib/database.js', 'utf-8')],
];

for (const [file, code] of report) {
  try {
    // Try Rollup's parser
    const { parseAstAsync } = await import('rollup/dist/es/shared/parseAst.js');
    await parseAstAsync(code);
    console.log(`PASS: ${file}`);
  } catch (e) {
    console.log(`FAIL: ${file}: ${e.message}`);
  }
}
