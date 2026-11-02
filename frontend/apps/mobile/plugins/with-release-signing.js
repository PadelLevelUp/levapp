/**
 * Expo config plugin (PAD-355): sign the Android `release` build with the owner's upload key when
 * `LEVAPP_UPLOAD_STORE_FILE` (and its passwords and alias) are set at Gradle time; otherwise keep
 * the template's debug signing. See `release-signing-gradle.js`.
 */
const { withAppBuildGradle } = require("expo/config-plugins");
const { applyReleaseSigning } = require("./release-signing-gradle");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("with-release-signing: app/build.gradle is not groovy");
    }
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
};
