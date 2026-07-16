import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "coverage",
  "node_modules",
  "dist"
]);
const checkedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".yml",
  ".yaml"
]);

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

    if (checkedExtensions.has(path.extname(entry))) {
      files.push(relPath);
    }
  }

  return files;
}

for (const file of collectFiles(root)) {
  try {
    const text = readFileSync(file, "utf8");

    if (!text.endsWith("\n")) {
      writeFileSync(file, text + "\n", "utf8");
      console.log(`Added trailing newline to: ${file}`);
    }
  } catch (err) {
    console.error(`Failed to fix ${file}: ${err.message}`);
  }
}
