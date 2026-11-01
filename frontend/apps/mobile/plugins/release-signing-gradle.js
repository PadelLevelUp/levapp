/**
 * PAD-355: the pure half of `with-release-signing`.
 *
 * The Expo template signs `release` with the DEBUG keystore. A store bundle has to be signed with
 * the owner's UPLOAD key (Play App Signing then re-signs it with the app key it holds). This adds
 * a `release` signing config that reads the upload key from the environment at Gradle time, and
 * makes the `release` build type use it only when `LEVAPP_UPLOAD_STORE_FILE` is set. Without the
 * variable the build is exactly the template's (debug-signed), so the emulator lane is untouched.
 *
 * No key or password is ever written into the generated file: Gradle reads the environment when
 * the build runs. Kept free of Expo imports so it is unit-tested by
 * `src/lib/release-signing-gradle.test.ts`.
 */
const ENV = {
  storeFile: "LEVAPP_UPLOAD_STORE_FILE",
  storePassword: "LEVAPP_UPLOAD_STORE_PASSWORD",
  keyAlias: "LEVAPP_UPLOAD_KEY_ALIAS",
  keyPassword: "LEVAPP_UPLOAD_KEY_PASSWORD",
};
const MARKER = "// PAD-355: upload-key signing";

const RELEASE_SIGNING_CONFIG = `
        ${MARKER} (env, read at build time; absent = the template's debug key)
        release {
            if (System.getenv("${ENV.storeFile}")) {
                storeFile file(System.getenv("${ENV.storeFile}"))
                storePassword System.getenv("${ENV.storePassword}")
                keyAlias System.getenv("${ENV.keyAlias}")
                keyPassword System.getenv("${ENV.keyPassword}")
            }
        }`;

const TEMPLATE_RELEASE_SIGNING = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

/**
 * Return `build.gradle` with the upload-key signing config added and the release build type
 * pointed at it. Idempotent; throws when the template's shape is not found, so a template change
 * fails the prebuild instead of silently shipping a debug-signed bundle.
 */
function applyReleaseSigning(buildGradle) {
  if (buildGradle.includes(MARKER)) return buildGradle;

  const signingConfigs = /signingConfigs\s*\{\s*\n(\s*)debug\s*\{[\s\S]*?\n\1\}/;
  if (!signingConfigs.test(buildGradle) || !TEMPLATE_RELEASE_SIGNING.test(buildGradle)) {
    throw new Error(
      "with-release-signing: app/build.gradle no longer has the Expo template's signingConfigs.debug " +
        "block and release `signingConfig signingConfigs.debug`; update plugins/release-signing-gradle.js",
    );
  }

  return buildGradle
    .replace(signingConfigs, (block) => `${block}${RELEASE_SIGNING_CONFIG}`)
    .replace(
      TEMPLATE_RELEASE_SIGNING,
      `$1signingConfig System.getenv("${ENV.storeFile}") ? signingConfigs.release : signingConfigs.debug`,
    );
}

module.exports = { ENV, MARKER, applyReleaseSigning };
