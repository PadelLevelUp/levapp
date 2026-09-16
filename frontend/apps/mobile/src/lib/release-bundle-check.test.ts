import { describe, expect, it } from "vitest";
import { checkReleaseBundle } from "../../scripts/release-bundle-check.mjs";

/**
 * PAD-351 (`mobile.release-build-target` rules 4-5): the archived bundle is
 * checked against the target it was named for, before anything is exported.
 */

const TARGETS = {
  production: "https://levapp.app/api",
  staging: "https://staging.levapp.app/api",
};
// Hermes bytecode keeps string literals as separate entries in its string table.
const DECLARES = " X-LevApp-Capabilities open-spots ";

describe("checkReleaseBundle (PAD-351)", () => {
  it("passes a production bundle that declares open spots", () => {
    const result = checkReleaseBundle(`${DECLARES}https://levapp.app/api`, "production", TARGETS);
    expect(result).toEqual({ ok: true, problems: [] });
  });

  it("refuses a staging bundle named production", () => {
    const result = checkReleaseBundle(
      `${DECLARES}https://staging.levapp.app/api`,
      "production",
      TARGETS
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("https://levapp.app/api");
    expect(result.problems.join("\n")).toContain("https://staging.levapp.app/api");
  });

  it("refuses a bundle that carries two targets", () => {
    const result = checkReleaseBundle(
      `${DECLARES}https://levapp.app/api https://staging.levapp.app/api`,
      "production",
      TARGETS
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("https://staging.levapp.app/api");
  });

  it("refuses the old host and the local backend", () => {
    for (const stray of ["https://padellevelup.com/api", "http://localhost:5001/api"]) {
      const result = checkReleaseBundle(
        `${DECLARES}https://levapp.app/api ${stray}`,
        "production",
        TARGETS
      );
      expect(result.ok, stray).toBe(false);
      expect(result.problems.join("\n")).toContain(stray);
    }
  });

  it("refuses a bundle without the capability declaration", () => {
    const result = checkReleaseBundle("https://levapp.app/api", "production", TARGETS);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("X-LevApp-Capabilities");
    expect(result.problems.join("\n")).toContain("open-spots");
  });

  it("passes a staging bundle named staging, whose URL contains 'levapp.app/api'", () => {
    // The production URL is not a substring of the staging one, but a
    // host-suffix match would be; pin that whole URLs are compared.
    const result = checkReleaseBundle(`${DECLARES}https://staging.levapp.app/api`, "staging", TARGETS);
    expect(result).toEqual({ ok: true, problems: [] });
  });

  it("refuses an unknown target", () => {
    const result = checkReleaseBundle(`${DECLARES}https://levapp.app/api`, "prod", TARGETS);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("prod");
  });
});
