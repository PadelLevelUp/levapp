import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ATTR, FLAG, applyCleartext, ciApkRequested } = require("../../plugins/cleartext-manifest.js");

/**
 * PAD-297 — the CI test APK may talk plain HTTP to the runner; a store build
 * must never inherit that. The plugin only adds the attribute when asked.
 */
function manifest() {
  return { manifest: { application: [{ $: { "android:name": ".MainApplication" } }] } };
}

describe("with-ci-cleartext (PAD-297)", () => {
  it("adds android:usesCleartextTraffic only when enabled", () => {
    const m = applyCleartext(manifest(), true);
    expect(m.manifest.application[0].$[ATTR]).toBe("true");
  });

  it("leaves the manifest untouched when disabled — a store build never gets the permission", () => {
    const m = applyCleartext(manifest(), false);
    expect(m.manifest.application[0].$).toEqual({ "android:name": ".MainApplication" });
    expect(ATTR in m.manifest.application[0].$).toBe(false);
  });

  it("is requested by LEVAPP_CI_APK=1 and by nothing else", () => {
    expect(FLAG).toBe("LEVAPP_CI_APK");
    expect(ciApkRequested({ LEVAPP_CI_APK: "1" })).toBe(true);
    expect(ciApkRequested({ LEVAPP_CI_APK: "true" })).toBe(false);
    expect(ciApkRequested({})).toBe(false);
  });

  it("tolerates a manifest without an application element", () => {
    expect(applyCleartext({ manifest: {} }, true)).toEqual({ manifest: {} });
  });
});
