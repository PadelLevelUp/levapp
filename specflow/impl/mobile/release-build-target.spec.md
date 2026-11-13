---
id: mobile.release-build-target
status: draft
depends_on: [eligibility.open-spot-visibility, settings.role-scope]
serves: [P-MOBILE-2]
governed_by: []
---

# mobile.release-build-target

### Intent
PAD-351. No iOS build since App Store 1.1.0 has pointed at production. Builds 12 and 14–22 went
to TestFlight pointing at `staging.levapp.app`, because `EXPO_PUBLIC_API_URL` was exported in the
shell that archived them. Nothing tied that value to what the build was for, and nothing read
the finished bundle afterwards. This leaf makes the target part of the build: the builder names
it, the value comes from a committed table, and the archived bundle is checked before upload.
It also makes the target visible inside the app.

### Entities
- **READS:** `frontend/apps/mobile/release-targets.json` (target name → API URL), the archived
  `main.jsbundle`, `app.json` version and build number (via `expo-constants`).
- **WRITES:** nothing at runtime.

### Rules

#### The target is named, and comes from the table
1. **One table.** `release-targets.json` maps `production` → `https://levapp.app/api` and
   `staging` → `https://staging.levapp.app/api`. The production host is `levapp.app`
   (coordinator decision for the owner, 2026-09-16). `padellevelup.com` stays up for the App
   Store builds already installed, and no new build uses it.
2. **The source agrees with the table.** `PRODUCTION_API_URL` in `src/lib/config.ts` (the release
   fallback when no URL is inlined) equals the table's `production`. Each EAS profile
   (`production`, `preview`) sets `EXPO_PUBLIC_API_URL` from the table (`production` and
   `staging` respectively). The literal is repeated rather than imported, because importing the
   table would put the staging URL into every production bundle and break rule 4.
3. **The release script takes a target, not an environment.** `scripts/ios-release.sh <target>
   <version> <build>` refuses a missing or unknown target. It exports `EXPO_PUBLIC_API_URL`
   from the table for that target, which overrides anything already set in the shell or in a
   `.env` file. It never passes through a value it was not given.
3a. **The release is archived with an Xcode the app can launch under.** Before it touches
   anything, the script runs `scripts/check-xcode.sh`. That refuses Xcode 27 and later, and any
   version it cannot read (exit 3). A build linked against the iOS 27 SDK crashes at launch,
   because the app has not adopted the UIScene lifecycle (PAD-467). The refusal names the way
   out: `DEVELOPER_DIR` pointing at an Xcode 26.x. `LEVAPP_ALLOW_XCODE_27=1` lets a build
   through with a warning, for PAD-467's own work. This rule is retired when the app adopts the
   UIScene lifecycle (the Expo SDK upgrade that follows PAD-467).
3b. **No pod targets below the app's minimum (PAD-467).** The config plugin
   `plugins/with-pod-deployment-floor.js` adds a block as the last step of the Podfile's
   `post_install` (after `react_native_post_install`); the function that builds that block, and
   that the tests call, is in `plugins/pod-deployment-floor.js`. The block
   lifts every pod build configuration whose `IPHONEOS_DEPLOYMENT_TARGET` is below 15.1 (the
   app's own minimum) to 15.1. Xcode 27 rejects a pod below 15 (ReachabilitySwift at 12.0 via
   expo-updates, RNSVG at 12.4, on 2026-09-29). Under Xcode 26.6 only those targets' settings move.
   A Podfile with no `post_install` makes the prebuild fail rather than skip the floor.
3c. **The React Native prebuilt cache is named and checked before anything changes.** The
   script takes the cache from `RN_PREBUILT_PODS` (a Pods directory holding
   `ReactNativeCore-artifacts/reactnative-core-<rn>-release.tar.gz` and
   `ReactNativeDependencies-artifacts/reactnative-dependencies-<rn>-release.tar.gz`, where `<rn>` is
   the `react-native` version pinned in the app's `package.json`) and has no default: the old default
   named a folder on a machine that is gone. After the Xcode check and
   before it edits `app.json` or prebuilds, it refuses when the variable is unset, when either
   release tarball is missing, or when the directory is inside the app's own `ios/` (the prebuild
   runs `--clean` and would delete the cache it is about to use). `LEVAPP_RELEASE_PREFLIGHT_ONLY=1`
   stops the script with exit 0 once these checks pass, so they are tested without a build.
3d. **The release is written outside the worktree.** The archive and the export go to
   `RELEASE_OUT`, by default `~/levapp-ios-archives/<version>-build<build>`, not into the
   worktree that is removed after the release. `scripts/testflight-upload.sh <version> <build>`
   resolves the same default from the same two arguments, so both scripts name one directory.
3e. **The upload checks its Python before it uploads.** `testflight-upload.sh` runs
   `asc_attach_build.py` with `ASC_PYTHON`, by default the backend venv of the checkout it runs
   from, else the main worktree's (first entry of `git worktree list --porcelain`). When none of
   them exists it refuses before calling altool, naming `ASC_PYTHON`.

#### The finished bundle is checked
4. **Before export, the archived bundle must match its target.** `scripts/verify-release-bundle.mjs`
   reads the archive's `main.jsbundle`; the script stops and exports nothing unless every check
   passes:
   - it contains the target's API URL;
   - it contains no other known API URL: every other target in the table,
     `https://padellevelup.com/api`, and `http://localhost:5001/api`;
   - it contains the capabilities header name (`X-LevApp-Capabilities`), the `open-spots`
     token (PAD-352, `eligibility.open-spot-visibility` rule 12) and, from PAD-402, the
     `evaluations` token (`evaluations.student-view` rule 5). Hermes keeps string literals
     readable in the bytecode, so a byte search works.

   The capability check is weaker than it looks, and this is stated so nobody over-reads it. The
   header name is a constant in `@levelup/api`, and `open-spots` also appears as a testID, so a
   bundle would carry both strings even if `initApi` dropped the declaration. The bundle check
   proves the build came from source at or after PAD-352; build 22 fails it. The declaration
   itself is pinned in source by `src/lib/api-capabilities.test.ts`, which runs in the unit suite
   before any release.
5. **The checker is unit-tested.** `scripts/release-bundle-check.mjs` contains the logic as a
   pure function. Its tests prove it rejects a staging bundle named `production`, a bundle with
   no capability declaration, and a bundle carrying two targets.

#### The target is visible
6. **Settings shows the build.** Below the section list, in every build, Settings shows a
   `settings-build-info` line: app version, build number and API host (for example `1.2.0 (23)
   · levapp.app`). When the host is not production's, the line also names it as a test server
   (`settings-build-info-test-server`), in a warning style. Only the host `levapp.app` is
   production's, so the old host `padellevelup.com` reads as non-production and would be labelled a
   test server (`describeApiTarget`); no new build points at it (rule 1).
7. **The sign-in screen warns in a non-production release build.** In a release build (`!__DEV__`)
   whose API host is not production's, the login screen shows `login-test-server-notice`, naming
   the host and saying that data there is reset. Debug builds do not show it: they always point
   at a local backend, and the notice would move the layout under every Maestro flow.
   `showsTestServerNotice(url, isDev)` in `src/lib/api-target.ts` decides this, and
   `describeApiTarget(url)` produces the host and the production flag for both surfaces.
8. **Copy is translated.** The keys live under `settings.buildInfo.*` in `src/locales/{pt,en}/settings.json`,
   a namespace mobile already imports statically.

#### Verification
9. Unit (vitest, apps/mobile): the table/source/EAS agreement (rules 1–2), the release script's
   target handling (rule 3, read statically), the Xcode check (rule 3a, run against a stub
   `xcodebuild`), the bundle checker (rules 4–5), and the target helpers (rule 7).
10. Maestro flow `54-settings-build-info` (renumbered from 53 at batch integration; PAD-335 holds 53):
    Settings shows `settings-build-info`, and on the debug build (local backend) it also shows
    `settings-build-info-test-server`.

### Acceptance Criteria

#### MOBILE-RELEASE-BUILD-TARGET-1: A production release names levapp.app everywhere it is stated
- Given `release-targets.json`, `config.ts` and `eas.json`
- When the release-target test runs
- Then `production` is `https://levapp.app/api` in all three, and the EAS `preview` profile is the table's `staging`

#### MOBILE-RELEASE-BUILD-TARGET-2: A staging bundle named production is refused
- Given a bundle containing `https://staging.levapp.app/api`, the header name and `open-spots`
- When it is checked against target `production`
- Then the check fails, naming the missing production URL and the unexpected staging URL

#### MOBILE-RELEASE-BUILD-TARGET-3: A bundle without the capability declaration is refused
- Given a bundle containing only `https://levapp.app/api`
- When it is checked against target `production`
- Then the check fails, naming `X-LevApp-Capabilities` and `open-spots`

#### MOBILE-RELEASE-BUILD-TARGET-4: A correct production bundle passes
- Given a bundle containing `https://levapp.app/api`, `X-LevApp-Capabilities` and `open-spots`, and no other known API URL
- When it is checked against target `production`
- Then the check passes

#### MOBILE-RELEASE-BUILD-TARGET-5: The release script refuses an unnamed target
- Given `scripts/ios-release.sh`
- When it is read
- Then it takes the target from its first argument, exits for anything not in the table, exports `EXPO_PUBLIC_API_URL` from the table, and runs the bundle checker before export

#### MOBILE-RELEASE-BUILD-TARGET-6: An Xcode 27 release is refused before anything changes
- Given `xcodebuild -version` reports `Xcode 27.0`
- When `scripts/ios-release.sh production 1.2.0 <build>` runs
- Then it exits 3 before editing `app.json` or prebuilding, naming PAD-467 and `DEVELOPER_DIR`
- And with `Xcode 26.6` the check passes, and with `LEVAPP_ALLOW_XCODE_27=1` Xcode 27 passes with a warning
- And an unreadable version is refused

#### MOBILE-RELEASE-BUILD-TARGET-7: Pods below the app's minimum are lifted to it (PAD-467)
- Given the Expo SDK 54 template Podfile
- When the prebuild runs the pod-deployment-floor plugin
- Then `post_install` ends with the floor block (15.1), after React Native's own step, added once however many prebuilds run
- And the rest of the Podfile is unchanged byte for byte
- And a Podfile without `post_install` is refused

#### MOBILE-RELEASE-BUILD-TARGET-8: A tester sees the server in Settings
- Given the debug build signed in as `e2e-coach`
- When Settings opens
- Then `settings-build-info` shows the version, build and host, and `settings-build-info-test-server` is visible

#### MOBILE-RELEASE-BUILD-TARGET-9: Only a non-production release build warns on sign-in
- Given the target helpers
- Then `showsTestServerNotice` is true for the staging URL in a release build, and false for production, and false for any URL in a debug build

#### MOBILE-RELEASE-BUILD-TARGET-10: The bundle check knows its targets and refuses a stray address (rules 4, 5)
- **Given** the release bundle check with the targets `production` and `staging`
- **When** a bundle is checked
- **Then** a production bundle that also carries the staging address, or the old `padellevelup.com` address, is refused, and the refusal names the stray address
- **And** a bundle checked under a target name that is not in the table is refused as an unknown target
- **And** a staging bundle checked as `staging` passes
test: `frontend/apps/mobile/src/lib/release-bundle-check.test.ts` › `refuses an unknown target` (+3 more)

#### MOBILE-RELEASE-BUILD-TARGET-11: The phone app declares the capabilities its screens rely on (rule 4; `calendar.view` rule 22, `clubs.coach-invitation` rule 9, `auth.register` rule 19, `classes.join-requests` rule 20)
- **Given** the phone app's API client set-up
- **When** its capability list is read
- **Then** it declares `open-spots`, `evaluations`, `student-relations`, `coach-invite-email`, `terms-acceptance` and `join-side`
- **And** it declares all thirteen tokens: `open-spots`, `evaluations`,
  `class-type-defaults`, `coach-invite-email`, `terms-acceptance`, `country-on-completion`,
  `terms-on-completion`, `adult-roster-confirmation`, `student-relations`, `full-classes`,
  `join-side`, `notification-sound` and `waiting-list-side`
test: `frontend/apps/mobile/src/lib/api-capabilities.test.ts` › `found the initApi call and its known options before judging it (R-032)` (+6 more)
- Code to follow: pin the whole list of thirteen tokens in one test in
  `frontend/apps/mobile/src/lib/api-capabilities.test.ts`; today it names six.

#### MOBILE-RELEASE-BUILD-TARGET-12: A release without a usable prebuilt cache is refused before anything changes (rule 3c)
- **Given** `scripts/ios-release.sh production 1.3.4 <build>` with an Xcode the check accepts
- **When** `RN_PREBUILT_PODS` is unset, or a release tarball is missing from it, or it lies inside the app's `ios/`
- **Then** the script exits non-zero naming `RN_PREBUILT_PODS`, and `app.json` is unchanged
- **And** with both tarballs present outside `ios/` and `LEVAPP_RELEASE_PREFLIGHT_ONLY=1`, it exits 0

#### MOBILE-RELEASE-BUILD-TARGET-13: The release output defaults outside the worktree, the same for both scripts (rule 3d)
- **Given** no `RELEASE_OUT`
- **When** `ios-release.sh` resolves its output for version `1.3.4` build `37`, and `testflight-upload.sh 1.3.4 37` resolves its export
- **Then** both name `~/levapp-ios-archives/1.3.4-build37`
- **And** a set `RELEASE_OUT` wins in both

#### MOBILE-RELEASE-BUILD-TARGET-14: The upload refuses a missing Python before it uploads (rule 3e)
- **Given** an export made by `ios-release.sh` and no usable Python at `ASC_PYTHON` or either default
- **When** `scripts/testflight-upload.sh 1.3.4 37` runs
- **Then** it exits non-zero naming `ASC_PYTHON`, and altool is never called

### Notes
- iOS-first by nature. The web has no counterpart: it calls `/api` on the host that serves it.
  Android (PAD-290) reuses the table and the checker when its release build exists.
- Uploading to TestFlight is `scripts/testflight-upload.sh` (altool with the ASC API key, then
  attach to the Internal group). It uploads only an export that `ios-release.sh` produced.
