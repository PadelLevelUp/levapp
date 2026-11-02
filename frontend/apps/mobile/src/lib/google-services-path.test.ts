import path from "path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FLAG, PATH_VAR, fcmRequested, resolveGoogleServicesFile } = require("../../plugins/google-services-path.js");

/**
 * PAD-355 (messaging.push-notifications rule 11e) — google-services.json is never committed. A
 * prebuild with LEVAPP_ANDROID_FCM=1 takes it from $GOOGLE_SERVICES_JSON or the operator's local
 * copy; without the flag there is no Firebase, so the CI emulator lane stays as it was.
 */
const ROOT = "/repo/frontend/apps/mobile";
const LOCAL = "/repo/docs/infra/google-services.json";
const present = (...paths: string[]) => (p: string) => paths.includes(p);

describe("with-google-services (PAD-355)", () => {
  it("is requested by LEVAPP_ANDROID_FCM=1 and by nothing else", () => {
    expect(FLAG).toBe("LEVAPP_ANDROID_FCM");
    expect(fcmRequested({ LEVAPP_ANDROID_FCM: "1" })).toBe(true);
    expect(fcmRequested({ LEVAPP_ANDROID_FCM: "true" })).toBe(false);
    expect(fcmRequested({})).toBe(false);
  });

  it("without the flag there is no Firebase, even if a file is lying around", () => {
    expect(resolveGoogleServicesFile(ROOT, {}, present(LOCAL))).toBeNull();
    expect(resolveGoogleServicesFile(ROOT, { [PATH_VAR]: "/tmp/gs.json" }, present("/tmp/gs.json"))).toBeNull();
  });

  it("with the flag, $GOOGLE_SERVICES_JSON wins (CI writes the secret there)", () => {
    expect(resolveGoogleServicesFile(ROOT, { [FLAG]: "1", [PATH_VAR]: "/tmp/gs.json" }, present("/tmp/gs.json", LOCAL))).toBe(
      "/tmp/gs.json",
    );
  });

  it("with the flag and no variable, the operator's copy in docs/infra is used", () => {
    expect(resolveGoogleServicesFile(ROOT, { [FLAG]: "1" }, present(LOCAL))).toBe(path.resolve(LOCAL));
  });

  it("with the flag and no file, the prebuild fails instead of shipping without push", () => {
    expect(() => resolveGoogleServicesFile(ROOT, { [FLAG]: "1" }, present())).toThrow(/no google-services\.json/);
    expect(() => resolveGoogleServicesFile(ROOT, { [FLAG]: "1", [PATH_VAR]: "/tmp/missing.json" }, present(LOCAL))).toThrow(
      /\/tmp\/missing\.json/,
    );
  });
});
