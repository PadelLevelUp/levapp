import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-352 (`eligibility.open-spot-visibility` rule 12): the mobile shell renders
 * open spots (rule 11), so it declares `open-spots` to the shared API client.
 * The next App Store build (PAD-351) is built from this source, and the
 * declaration is what makes the server send it open spots at all. Without it,
 * students on the new build lose the feature silently.
 *
 * `api.ts` imports native Expo modules that don't load under vitest, so this
 * reads the source, the same way `class-screen-hooks.test.ts` does. Per R-032 it
 * first proves it found the `initApi` call before judging it.
 */

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "api.ts");

function initApiCall(): string {
  expect(fs.existsSync(SOURCE), `cannot find the mobile API client at ${SOURCE}`).toBe(true);
  const text = fs.readFileSync(SOURCE, "utf8");
  const start = text.indexOf("initApi({");
  expect(start, "no `initApi({` call in api.ts").toBeGreaterThanOrEqual(0);
  const end = text.indexOf("});", start);
  expect(end, "the `initApi({` call never closes").toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("mobile API client declares its capabilities (PAD-352)", () => {
  it("found the initApi call and its known options before judging it (R-032)", () => {
    const call = initApiCall();
    expect(call).toMatch(/baseURL:/);
    expect(call).toMatch(/storage:/);
  });

  it("declares open-spots to the shared client", () => {
    expect(initApiCall()).toMatch(/capabilities:\s*\[[^\]]*["']open-spots["'][^\]]*\]/);
  });

  // PAD-364: declared from slice 2 on, consumed by nothing yet — it will gate the student
  // dashboard block of a shared evaluation. A build that drops it loses that block silently.
  it("declares evaluations to the shared client", () => {
    expect(initApiCall()).toMatch(/capabilities:\s*\[[^\]]*["']evaluations["'][^\]]*\]/);
  });
});
