---
id: mobile.android-play-bundle
status: implementing
depends_on: [mobile.release-build-target, mobile.android-runtime]
implements: ../../specs-business/mobile/store-build-reaches-real-users.business.md
governed_by: []
---

# mobile.android-play-bundle

### Intent
PAD-355. Google Play takes an Android App Bundle (AAB), signed with the owner's upload key; Play
App Signing then re-signs it for devices. Until now the only Android build was the CI emulator
APK (PAD-297): signed with the Expo template's debug key, pointing at the runner, cleartext
allowed. This leaf adds the store build on the same GitHub runner, with no keystore and no
Firebase file ever committed. A bundle that is not fit for Play says so in its name.

### Entities
- **READS:** `android-build.yaml` (the `aab` job), `release-targets.json`,
  `scripts/verify-release-bundle.mjs`, `app.json` (`expo.version`, `expo.android.versionCode`),
  the GitHub secrets `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_STORE_PASSWORD`,
  `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` and `GOOGLE_SERVICES_JSON_BASE64`.
- **WRITES:** the workflow artefact (the `.aab`), the run's step summary.
- **CREATES:** the config plugins `plugins/with-release-signing.js` (pure half
  `release-signing-gradle.js`) and `plugins/with-google-services.js` (pure half
  `google-services-path.js`).

### Rules

#### The signing config
1. **The upload key is read at Gradle time, never written into a file.** `with-release-signing`
   adds a `release` signing config to `app/build.gradle` whose store file, store password, key
   alias and key password are `System.getenv("LEVAPP_UPLOAD_STORE_FILE")`,
   `…_STORE_PASSWORD`, `…_KEY_ALIAS` and `…_KEY_PASSWORD`. The `release` build type uses it when
   `LEVAPP_UPLOAD_STORE_FILE` is set and the template's debug config otherwise, so the emulator
   APK (no variables) builds exactly as before. The `debug` build type and debug config are not
   touched. The plugin is idempotent (marker `// PAD-355: upload-key signing`) and fails the
   prebuild if the template's `signingConfigs` / `release` shape is not the one it knows.
2. **No key is generated or committed by the code.** The owner makes the upload key with
   `keytool` and stores it as the four `ANDROID_UPLOAD_*` secrets; the steps are in an owner
   handoff, not in the repository.

#### The bundle job
3. **When it runs.** `workflow_dispatch` with `aab: true`, and a pull request into `staging` that
   changes `android-build.yaml`, `frontend/apps/mobile/plugins/**` or `frontend/apps/mobile/app.json`
   (path filter inside the job; otherwise the job does nothing and succeeds). Never on the
   schedule. A dispatch with `aab: true` skips the `apk` job, and with it the Maestro matrix and
   the lane check.
4. **A store build.** The prebuild runs without `LEVAPP_CI_APK`, and the job fails if the
   manifest carries `usesCleartextTraffic` or if `app/build.gradle` lacks rule 1's marker.
   `EXPO_PUBLIC_API_URL` is the `target` input's URL from `release-targets.json` (`production`
   by default; a pull request always builds `production`). `gradlew bundleRelease` builds all
   four ABIs (no `reactNativeArchitectures` override).
5. **The bundled JS is checked against its target.** `base/assets/index.android.bundle` is read
   out of the `.aab` and passed to `verify-release-bundle.mjs` with the target, the same check an
   iOS archive passes (`mobile.release-build-target` rule 4). A failure stops the job before any
   artefact is uploaded.
6. **versionCode.** A dispatch's `version_code` input, when given, must be a positive integer
   of at most nine digits and replaces `expo.android.versionCode` before the prebuild; anything
   else fails the job. Empty keeps `app.json`'s value.

#### Signed or not, and saying so
7. **The upload key only on a dispatch.** The keystore is decoded to a temp file, and the four
   `LEVAPP_UPLOAD_*` variables set, only on `workflow_dispatch` and only when all four secrets
   are present. A pull request never signs with it. `require_upload_key: true` fails the job
   when they are not all present. The temp keystore and Firebase file are removed at the end
   of the job, whatever its result.
8. **The artefact's name says what it is.** Upload-signed: `levapp-android-aab-<version>-<versionCode>`.
   Debug-signed: `levapp-android-aab-NOT-FOR-PLAY-debug-signed`. The step summary states the
   same thing, the signer (`keytool -printcert -jarfile`) with its SHA-256, the version, the API
   target, whether FCM was configured, and the file's sha256.
9. **A bundle meant to be upload-signed is never debug-signed.** If the job signed with the
   upload key and the bundle's signer is `Android Debug`, the job fails.

#### Firebase
10. **FCM follows `messaging.push-notifications` rule 11(e).** When `GOOGLE_SERVICES_JSON_BASE64`
    is set, the job writes it to a temp file and prebuilds with `LEVAPP_ANDROID_FCM=1` and
    `GOOGLE_SERVICES_JSON=<that file>`; otherwise the bundle has no Firebase config.

### Acceptance Criteria

#### Release signing reads the environment
- **Given** the Expo SDK 54 template's `app/build.gradle`
- **When** `applyReleaseSigning` runs on it
- **Then** a `release` signing config reads the four `LEVAPP_UPLOAD_*` variables, the `release`
  build type picks `signingConfigs.release` only when `LEVAPP_UPLOAD_STORE_FILE` is set, the only
  literal store password is the template's `'android'`, and a second run changes nothing

#### An unknown template shape stops the prebuild
- **Given** an `app/build.gradle` whose `release` build type has no `signingConfig signingConfigs.debug`
- **When** `applyReleaseSigning` runs on it
- **Then** it throws an error naming `with-release-signing`

#### A dispatch for Play builds only the bundle
- **Given** `android-build.yaml`
- **When** it is read
- **Then** the `apk` job is skipped on a `workflow_dispatch` with `aab`, the `aab` job runs on
  `pull_request` and on a dispatch with `aab` and never on `schedule`, and its `bundleRelease`
  step has no `reactNativeArchitectures` override

#### The upload key never reaches a pull request
- **Given** the `aab` job
- **When** its secrets step is read
- **Then** the keystore is decoded only under `GITHUB_EVENT_NAME = workflow_dispatch`, and no
  `run:` script splices `${{ secrets.* }}` or `${{ inputs.* }}`

#### The name says NOT-FOR-PLAY
- **Given** a run with no upload key
- **When** the bundle is summarised
- **Then** the artefact is `levapp-android-aab-NOT-FOR-PLAY-debug-signed`; with the key it is
  `levapp-android-aab-<version>-<versionCode>`, and a debug signer on it fails the job

### Notes
- Play App Signing: Google holds the app signing key; the upload key only proves the upload. A
  lost upload key is reset through Play Console support, not by re-publishing.
- First upload: the owner creates the app in Play Console (D-U-N-S on file, 2026-10-30) and
  uploads the first signed bundle by hand; automating the upload (Play Developer API) is a
  later ticket.
- OPEN: none.
