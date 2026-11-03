/**
 * PAD-355 (messaging.push-notifications rule 11e): the pure half of `with-google-services`.
 *
 * Android push goes through Firebase Cloud Messaging, which needs `google-services.json` in the
 * native project. The file is never committed. A prebuild with `LEVAPP_ANDROID_FCM=1` takes it
 * from `$GOOGLE_SERVICES_JSON` (a path: CI writes the GitHub secret to a temp file; EAS's
 * file-typed variable of the same name is a path too), or else from the operator's local copy at
 * `<repo>/docs/infra/google-services.json` (gitignored). Without the flag the prebuild has no
 * Firebase at all, so the CI emulator lane and debug builds stay as they were.
 *
 * Kept free of Expo imports so it is unit-tested by `src/lib/google-services-path.test.ts`.
 */
const path = require("path");

const FLAG = "LEVAPP_ANDROID_FCM";
const PATH_VAR = "GOOGLE_SERVICES_JSON";
// From frontend/apps/mobile to the repository root.
const LOCAL_COPY = path.join("..", "..", "..", "docs", "infra", "google-services.json");

/** Whether the current process asked for an FCM-enabled Android build. */
function fcmRequested(env = process.env) {
  return env[FLAG] === "1";
}

/**
 * The absolute path of `google-services.json` for this prebuild, or `null` when FCM is off.
 * Throws when FCM is on and the file is missing: a store build must never ship without push by
 * accident.
 */
function resolveGoogleServicesFile(projectRoot, env = process.env, exists = require("fs").existsSync) {
  if (!fcmRequested(env)) return null;
  const candidate = env[PATH_VAR] ? path.resolve(projectRoot, env[PATH_VAR]) : path.resolve(projectRoot, LOCAL_COPY);
  if (!exists(candidate)) {
    throw new Error(
      `with-google-services: ${FLAG}=1 but no google-services.json at ${candidate} ` +
        `(set ${PATH_VAR} to its path, or put the operator copy at docs/infra/google-services.json)`,
    );
  }
  return candidate;
}

module.exports = { FLAG, PATH_VAR, LOCAL_COPY, fcmRequested, resolveGoogleServicesFile };
