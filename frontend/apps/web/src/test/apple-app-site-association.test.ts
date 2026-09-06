import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the Apple App Site Association file (PAD-184) that makes an invite or
 * register link open the iOS app instead of Safari.
 *
 * This file is unusually easy to break silently: it has no extension, it lives
 * in a dot-directory, and iOS reports nothing useful when it is wrong — the link
 * just opens the browser, exactly as it did before the feature existed. So the
 * three things that would break it are pinned here:
 *
 *   1. It is valid JSON. Apple rejects the file outright otherwise (no BOM, no
 *      comments, no trailing commas).
 *   2. The app ID is `<teamID>.<bundleID>`, matching apps/mobile/app.json.
 *   3. The claimed paths match the routes App.tsx actually serves. Claiming a
 *      path the web app does not have would send a tap into the app and then
 *      nowhere; not claiming one the app has means the link stays in Safari.
 *
 * Vite copies `public/` into `dist/` verbatim, dot-directories included, so
 * `public/.well-known/…` ships as `dist/.well-known/…` with no config. That is
 * asserted below when a build is present, and left as a note (not a failure)
 * when it is not — this suite must not require a prior `npm run build`.
 *
 * The remaining half — serving it as `application/json` — lives in
 * apps/web/nginx.conf and, for the host nginx in front of the container, in
 * docs/infra/universal-links.md.
 */

const WEB_ROOT = path.resolve(__dirname, "../..");
const AASA_RELATIVE = ".well-known/apple-app-site-association";
const SOURCE = path.join(WEB_ROOT, "public", AASA_RELATIVE);
const BUILT = path.join(WEB_ROOT, "dist", AASA_RELATIVE);

/** Must equal `ios.appleTeamId` + `ios.bundleIdentifier` from apps/mobile/app.json. */
const EXPECTED_APP_ID = "9K2J8D2ARR.com.padellevelup.app";

/** The account-creation entry points, as declared in apps/web/src/App.tsx. */
const EXPECTED_PATHS = ["/invite/player/*", "/invite/coach/*", "/register/*"];

type Aasa = {
  applinks?: {
    details?: Array<{
      appIDs?: string[];
      appID?: string;
      components?: Array<Record<string, unknown>>;
    }>;
  };
};

function readAasa(file: string): Aasa {
  const raw = readFileSync(file, "utf8");
  expect(raw.charCodeAt(0), "file must not start with a UTF-8 BOM").not.toBe(0xfeff);
  return JSON.parse(raw) as Aasa;
}

describe("apple-app-site-association", () => {
  it("exists in the public directory", () => {
    expect(existsSync(SOURCE)).toBe(true);
  });

  it("is valid JSON", () => {
    expect(() => readAasa(SOURCE)).not.toThrow();
  });

  it("declares the iOS app by team ID and bundle ID", () => {
    const detail = readAasa(SOURCE).applinks?.details?.[0];
    expect(detail?.appIDs).toEqual([EXPECTED_APP_ID]);
  });

  it("claims exactly the three account-creation paths", () => {
    const detail = readAasa(SOURCE).applinks?.details?.[0];
    const claimed = (detail?.components ?? []).map((component) => component["/"]);
    expect(claimed).toEqual(EXPECTED_PATHS);
  });

  it("claims no path the mobile app has no route for", () => {
    // A wildcard broader than these would swallow every levapp.app link into
    // the app, including marketing pages the app cannot render.
    const detail = readAasa(SOURCE).applinks?.details?.[0];
    for (const component of detail?.components ?? []) {
      expect(component["/"]).not.toBe("*");
      expect(component["/"]).not.toBe("/*");
    }
  });

  it("is copied into dist/.well-known/ by the Vite build", () => {
    if (!existsSync(path.join(WEB_ROOT, "dist"))) {
      // No build in this working tree; nothing to check. `npm run build` in CI
      // (and the Docker image build) is what exercises this.
      return;
    }
    expect(
      existsSync(BUILT),
      "public/.well-known/ must survive the build — Vite copies dot-directories verbatim; " +
        "a `publicDir: false` or an ignore rule would silently drop it"
    ).toBe(true);
    expect(readFileSync(BUILT, "utf8")).toBe(readFileSync(SOURCE, "utf8"));
  });
});
