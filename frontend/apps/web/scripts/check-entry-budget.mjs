#!/usr/bin/env node
// client.route-loading rule 8 (PAD-585): the first download stays within its budget.
//
// Reads dist/.vite/manifest.json (vite build with `build.manifest`), follows the entry's static
// imports (not its dynamic ones: those are the lazy pages), and sums the gzip size of every JS and
// CSS file a first visit downloads. Fails above ENTRY_BUDGET_GZIP_BYTES, or if any JS chunk in
// the build exceeds CHUNK_LIMIT_RAW_BYTES raw (Vite's own 500 kB warning, made a failure).
//
// Usage: node apps/web/scripts/check-entry-budget.mjs [distDir]   (default apps/web/dist)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENTRY_BUDGET_GZIP_BYTES = 300 * 1000;
export const CHUNK_LIMIT_RAW_BYTES = 500 * 1000;

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] ?? path.join(here, "..", "dist"));
const manifest = JSON.parse(readFileSync(path.join(dist, ".vite", "manifest.json"), "utf8"));

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entryKey) {
  console.error("check-entry-budget: no entry in the manifest");
  process.exit(1);
}

const files = new Set();
const seen = new Set();
(function walk(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  files.add(chunk.file);
  for (const css of chunk.css ?? []) files.add(css);
  for (const imported of chunk.imports ?? []) walk(imported);
})(entryKey);

let total = 0;
const rows = [];
for (const file of files) {
  const gz = gzipSync(readFileSync(path.join(dist, file)), { level: 9 }).length;
  total += gz;
  rows.push([file, gz]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [file, gz] of rows) console.log(`  ${(gz / 1000).toFixed(2).padStart(9)} kB gzip  ${file}`);
console.log(`entry total: ${(total / 1000).toFixed(2)} kB gzip (budget ${ENTRY_BUDGET_GZIP_BYTES / 1000} kB), ${files.size} files`);

const oversized = readdirSync(path.join(dist, "assets"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => [name, statSync(path.join(dist, "assets", name)).size])
  .filter(([, size]) => size > CHUNK_LIMIT_RAW_BYTES);
for (const [name, size] of oversized) console.error(`chunk over ${CHUNK_LIMIT_RAW_BYTES / 1000} kB raw: ${name} ${(size / 1000).toFixed(2)} kB`);

if (total > ENTRY_BUDGET_GZIP_BYTES || oversized.length > 0) {
  console.error("check-entry-budget: FAILED");
  process.exit(1);
}
console.log("check-entry-budget: ok");
