/**
 * admin.foundation rules 14 and 16, "The console builds alone": the console's strings and client
 * live only here. Two directions: a console-only key is absent from the product's sources, and the
 * console's sources name no product route. The backend guard (test_pad531_guards.py) proves the
 * other half — no product file mentions `/admin/api` or imports apps/admin.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import pt from "./locales/pt.json";

const FRONTEND = resolve(__dirname, "..", "..", "..");
const PRODUCT = [join(FRONTEND, "apps", "web", "src"), join(FRONTEND, "src", "locales"), join(FRONTEND, "packages")];
const CONSOLE = resolve(__dirname);
const CONSOLE_ONLY_TEXT = pt.admin.notConfigured.title; // "Início de sessão por configurar"

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|json)$/.test(name)) out.push(full);
  }
  return out;
}

describe("the console builds alone", () => {
  it("a console-only string is nowhere in the product sources", () => {
    const hits = PRODUCT.flatMap((dir) => walk(dir)).filter((f) => readFileSync(f, "utf8").includes(CONSOLE_ONLY_TEXT));
    expect(hits).toEqual([]);
  });

  it("the console names no product route and no product resource client", () => {
    const hits = walk(CONSOLE)
      .filter((f) => !f.endsWith("console-only.test.ts"))
      .filter((f) => /(?<!\/admin)\/api\/(app|auth)\/|@levelup\/api|@levelup\/hooks/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
