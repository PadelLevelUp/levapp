/**
 * Expo config plugin (PAD-355): with `LEVAPP_ANDROID_FCM=1` at prebuild, point
 * `android.googleServicesFile` at the uncommitted `google-services.json`, so Expo's own
 * GoogleServices mods copy it into the native project and apply the Gradle plugin. Without the
 * flag this is a no-op. See `google-services-path.js`.
 */
const { resolveGoogleServicesFile } = require("./google-services-path");

module.exports = function withGoogleServices(config) {
  const file = resolveGoogleServicesFile(config._internal?.projectRoot ?? process.cwd());
  if (!file) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
