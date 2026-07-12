import { readFileSync, readdirSync, statSync } from "node:fs";
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

const errors = [];

for (const file of collectFiles(root)) {
  const text = readFileSync(file, "utf8");

  if (text.charCodeAt(0) === 0xfeff) {
    errors.push(`${file}: remove UTF-8 BOM`);
  }

  if (!text.endsWith("\n")) {
    errors.push(`${file}: add trailing newline`);
  }

  if (path.extname(file) === ".json") {
    try {
      JSON.parse(text);
    } catch (err) {
      errors.push(`${file}: invalid JSON (${err.message})`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Format checks passed.");
