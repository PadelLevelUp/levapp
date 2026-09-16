import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRODUCTION_API_URL } from "./api-target";

/**
 * PAD-351 (`mobile.release-build-target` rules 1-3): the server a release
 * build talks to is named when the build is made, and read from one committed
 * table. Builds 12 and 14-22 reached TestFlight pointing at staging because
 * the value came from whatever the archiving shell had exported.
 */

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(rel: string): Record<string, unknown> {
  const file = path.join(MOBILE, rel);
  expect(fs.existsSync(file), `cannot find ${file}`).toBe(true);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

describe("release targets (PAD-351)", () => {
  it("names levapp.app as production and staging.levapp.app as staging (rule 1)", () => {
    expect(readJson("release-targets.json")).toEqual({
      production: "https://levapp.app/api",
      staging: "https://staging.levapp.app/api",
    });
  });

  it("uses the table's production URL as the source's release fallback (rule 2)", () => {
    expect(PRODUCTION_API_URL).toBe(readJson("release-targets.json").production);
  });

  it("sets each EAS release profile's API URL from the table (rule 2)", () => {
    const targets = readJson("release-targets.json");
    const build = (readJson("eas.json").build ?? {}) as Record<
      string,
      { env?: Record<string, string> }
    >;
    expect(build.production?.env?.EXPO_PUBLIC_API_URL).toBe(targets.production);
    expect(build.preview?.env?.EXPO_PUBLIC_API_URL).toBe(targets.staging);
  });

  describe("scripts/ios-release.sh (rule 3)", () => {
    const script = path.join(MOBILE, "scripts", "ios-release.sh");

    function source(): string {
      expect(fs.existsSync(script), `cannot find ${script}`).toBe(true);
      return fs.readFileSync(script, "utf8");
    }

    it("found the archive step before judging the script (R-032)", () => {
      expect(source()).toMatch(/xcodebuild[^\n]*archive/);
    });

    it("takes the target from its first argument and resolves it through the table", () => {
      const text = source();
      expect(text).toMatch(/TARGET="\$\{1:-\}"/);
      expect(text).toMatch(/release-targets\.json/);
      expect(text).toMatch(/export EXPO_PUBLIC_API_URL="\$API_URL"/);
    });

    it("runs the bundle checker between archive and export", () => {
      const text = source();
      const archive = text.search(/xcodebuild[^\n]*archive/);
      const verify = text.indexOf("verify-release-bundle.mjs");
      const exportStep = text.indexOf("-exportArchive");
      expect(verify, "the script never runs verify-release-bundle.mjs").toBeGreaterThan(archive);
      expect(exportStep, "the script never exports").toBeGreaterThan(verify);
    });
  });
});
