/**
 * PAD-297 (Android wave A): the pure half of `with-ci-cleartext`.
 *
 * A release APK refuses plain-HTTP traffic, and the CI emulator lane talks to
 * the runner's Flask over `http://10.0.2.2:5001`. So a CI test build — and
 * ONLY a CI test build — gets `android:usesCleartextTraffic="true"` on the
 * `<application>` element. Kept free of Expo imports so it is unit-tested by
 * `src/lib/ci-cleartext.test.ts`; the workflow additionally asserts that a
 * prebuild without the flag produces a manifest with no cleartext permission.
 */
const FLAG = "LEVAPP_CI_APK";
const ATTR = "android:usesCleartextTraffic";

/** Whether the current process asked for a CI test build. */
function ciApkRequested(env = process.env) {
  return env[FLAG] === "1";
}

/**
 * Return the manifest with the cleartext attribute set (enabled) or left
 * untouched (disabled). Never removes an attribute that was already there:
 * this plugin only ever adds, and only when asked.
 */
function applyCleartext(manifest, enabled) {
  const application = manifest?.manifest?.application?.[0];
  if (!application) return manifest;
  if (!enabled) return manifest;
  application.$ = { ...(application.$ || {}), [ATTR]: "true" };
  return manifest;
}

module.exports = { FLAG, ATTR, ciApkRequested, applyCleartext };
