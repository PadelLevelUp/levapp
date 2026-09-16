/**
 * Expo config plugin (PAD-297): allow cleartext HTTP in the Android manifest
 * ONLY when `LEVAPP_CI_APK=1` is set at prebuild time — the CI emulator lane's
 * test APK, which reaches the runner's Flask over http://10.0.2.2:5001.
 * A prebuild without the flag is a no-op, so a store build can never inherit
 * the permission (the workflow asserts this on every run).
 */
const { withAndroidManifest } = require("expo/config-plugins");
const { applyCleartext, ciApkRequested } = require("./cleartext-manifest");

module.exports = function withCiCleartext(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = applyCleartext(mod.modResults, ciApkRequested());
    return mod;
  });
};
