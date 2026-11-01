import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ENV, MARKER, applyReleaseSigning } = require("../../plugins/release-signing-gradle.js");

/**
 * PAD-355 — a Play bundle is signed with the owner's upload key, read from the environment at
 * Gradle time; without it the build keeps the template's debug key (the emulator lane). The
 * excerpt is the Expo SDK 54 template's (`expo-template-bare-minimum` 54.0.x, app/build.gradle).
 */
const TEMPLATE = `android {
    defaultConfig {
        versionCode 1
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

describe("with-release-signing (PAD-355)", () => {
  it("adds a release signing config that reads the upload key from the environment", () => {
    const out = applyReleaseSigning(TEMPLATE);
    expect(out).toContain(MARKER);
    for (const name of Object.values(ENV)) expect(out).toContain(`System.getenv("${name}")`);
    expect(out).toMatch(/release \{\s*\n\s*if \(System\.getenv\("LEVAPP_UPLOAD_STORE_FILE"\)\)/);
  });

  it("points only the release build type at it, and only when the store file is set", () => {
    const out = applyReleaseSigning(TEMPLATE);
    const buildTypes = out.slice(out.indexOf("buildTypes"));
    expect(buildTypes).toMatch(
      /release \{[\s\S]*signingConfig System\.getenv\("LEVAPP_UPLOAD_STORE_FILE"\) \? signingConfigs\.release : signingConfigs\.debug/,
    );
    // The debug build type and the debug signing config are untouched.
    expect(buildTypes).toMatch(/debug \{\s*\n\s*signingConfig signingConfigs\.debug\s*\n\s*\}/);
    expect(out).toContain("keyAlias 'androiddebugkey'");
  });

  it("writes no key material into the file", () => {
    const out = applyReleaseSigning(TEMPLATE);
    // The only literal password is the template's public debug one; the added config reads env.
    expect(out.match(/storePassword .*/g)).toEqual([
      "storePassword 'android'",
      'storePassword System.getenv("LEVAPP_UPLOAD_STORE_PASSWORD")',
    ]);
  });

  it("is idempotent", () => {
    const once = applyReleaseSigning(TEMPLATE);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it("fails loudly when the template's shape changes", () => {
    expect(() => applyReleaseSigning(TEMPLATE.replace("signingConfig signingConfigs.debug\n            def", "def"))).toThrow(
      /with-release-signing/,
    );
    expect(() => applyReleaseSigning("android {}")).toThrow(/with-release-signing/);
  });
});
