import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "coverage",
  "node_modules",
  "dist",
  "tools"
]);

const placeholderPatterns = [
  /expect\(true\)\.toBe\(true\)/,
  /Would need/i,
  /For now, verify/i,
  /We can't directly/i,
  /Implementation would need/i,
  /Requires DOM environment/i
];

function collectFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(root, fullPath);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) files.push(...collectFiles(fullPath));
      continue;
    }

    if (/\.(?:js|mjs|cjs)$/.test(entry)) {
      files.push(relPath);
    }
  }

  return files;
}

const jsFiles = collectFiles(root);
const errors = [];

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    errors.push(`Syntax check failed for ${file}\n${err.stderr?.toString() || err.message}`);
  }

  const text = readFileSync(file, "utf8");
  for (const pattern of placeholderPatterns) {
    if (pattern.test(text)) {
      errors.push(`Placeholder test/review text found in ${file}: ${pattern}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}

console.log(`Checked ${jsFiles.length} JavaScript files.`);
