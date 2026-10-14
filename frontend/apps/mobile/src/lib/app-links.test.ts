import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UNIVERSAL_LINK_HOSTS } from "./universalLinks";

/**
 * PAD-595 close-out — deep links: a levapp.app link opens the app, and during the transition the
 * old hosts keep opening it too (the ticket's "safe approach", item 5: keep both domains
 * associated so older builds and already printed QR codes keep working). The AASA file itself
 * is pinned by apps/web/src/test/apple-app-site-association.test.ts.
 */
const appJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../app.json"), "utf8")).expo;
const HOSTS = ["levapp.app", "padellevelup.com", "www.padellevelup.com"];
const ENTRY_PATHS = ["/invite/player/", "/invite/coach/", "/register/"];

describe("app links (PAD-595)", () => {
  it("iOS associates levapp.app and keeps both old hosts", () => {
    expect(appJson.ios.associatedDomains).toEqual(HOSTS.map((h) => `applinks:${h}`));
  });

  it("Android verifies every account entry path on levapp.app and on both old hosts", () => {
    const filter = appJson.android.intentFilters.find(
      (f: { action: string; autoVerify?: boolean }) => f.action === "VIEW" && f.autoVerify
    );
    const claimed = new Set(
      filter.data.map((d: { scheme: string; host: string; pathPrefix: string }) => `${d.scheme}://${d.host}${d.pathPrefix}`)
    );
    for (const host of HOSTS) {
      for (const p of ENTRY_PATHS) expect(claimed.has(`https://${host}${p}`), `${host}${p}`).toBe(true);
    }
  });

  it("the app parses links from levapp.app first", () => {
    expect(UNIVERSAL_LINK_HOSTS[0]).toBe("levapp.app");
  });
});
