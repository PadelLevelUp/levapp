#!/usr/bin/env node
// Usage: node scripts/verify-release-bundle.mjs <main.jsbundle> <target>
// Exits 1 unless the archived bundle matches its target (PAD-351).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseBundle } from "./release-bundle-check.mjs";

const [bundlePath, target] = process.argv.slice(2);
if (!bundlePath || !target) {
  console.error("usage: verify-release-bundle.mjs <main.jsbundle> <target>");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const targets = JSON.parse(readFileSync(join(here, "..", "release-targets.json"), "utf8"));
const { ok, problems } = checkReleaseBundle(readFileSync(bundlePath, "latin1"), target, targets);
if (!ok) {
  console.error(`BUNDLE CHECK FAILED for target "${target}":`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`BUNDLE CHECK PASSED: ${targets[target]}, X-LevApp-Capabilities, open-spots`);
