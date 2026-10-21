import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./base";

/** delivery.api-host rule 4 (PAD-614): one configurable base for every API call the web makes. */
describe("resolveApiBaseUrl", () => {
  it("keeps the same-origin /api when the build sets nothing", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("/api");
    expect(resolveApiBaseUrl("")).toBe("/api");
    expect(resolveApiBaseUrl("   ")).toBe("/api");
  });

  it("uses the configured API host, without a trailing slash", () => {
    expect(resolveApiBaseUrl("https://api.levapp.app/api/")).toBe("https://api.levapp.app/api");
    expect(resolveApiBaseUrl("https://api.staging.levapp.app/api")).toBe("https://api.staging.levapp.app/api");
  });
});

describe("no hard-coded API path", () => {
  it("no web module calls fetch with a literal /api/ URL", () => {
    const src = path.resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (/fetch\(\s*["'`]\/api\//.test(readFileSync(full, "utf8"))) offenders.push(path.relative(src, full));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
