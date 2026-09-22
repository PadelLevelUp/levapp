/**
 * evaluations.legacy-client-contract / R-047 point 8 (PAD-374): the NEW evaluation UI calls
 * none of the four frozen write/list endpoints, so a request to one of them can only come
 * from an App Store build — which is what makes the retirement measurement possible. This
 * reads the source, so it holds for web AND iOS in one place.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const NEW_UI = [
  "apps/web/src/components/evaluations",
  "apps/mobile/src/features/evaluations",
  "packages/hooks/src/evaluations.ts",
  "packages/api/src/resources/evaluationRecords.ts",
].map((p) => join(ROOT, p));
const LEGACY = [
  "/app/evaluation_categories",
  "/app/add_evaluation_entry",
  "/app/add_evaluation_categories",
  "/app/delete/evaluation_category",
  "@/api/evaluation\"",
  "resources/evaluation\"",
];

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

describe("the new evaluation UI calls no frozen legacy endpoint", () => {
  it.each(NEW_UI)("%s", (path) => {
    for (const file of files(path)) {
      if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const needle of LEGACY) expect(source, `${file} mentions ${needle}`).not.toContain(needle);
    }
  });
});
