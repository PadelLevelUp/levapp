---
id: mobile.release-build-target
status: draft
depends_on: [eligibility.open-spot-visibility, settings.role-scope]
implements: ../../specs-business/mobile/store-build-reaches-real-users.business.md
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

#### The finished bundle is checked
4. **Before export, the archived bundle must match its target.** `scripts/verify-release-bundle.mjs`
   reads the archive's `main.jsbundle`; the script stops and exports nothing unless every check
   passes:
   - it contains the target's API URL;
   - it contains no other known API URL: every other target in the table,
     `https://padellevelup.com/api`, and `http://localhost:5001/api`;
   - it contains the capabilities header name (`X-LevApp-Capabilities`) and the `open-spots`
     token (PAD-352, `eligibility.open-spot-visibility` rule 12). Hermes keeps string literals
     readable in the bytecode, so a byte search works.
5. **The checker is unit-tested.** `scripts/release-bundle-check.mjs` contains the logic as a
   pure function. Its tests prove it rejects a staging bundle named `production`, a bundle with
   no capability declaration, and a bundle carrying two targets.

#### The target is visible
6. **Settings shows the build.** Below the section list, in every build, Settings shows a
   `settings-build-info` line: app version, build number and API host (for example `1.2.0 (23)
   · levapp.app`). When the host is not production's, the line also names it as a test server
   (`settings-build-info-test-server`), in a warning style.
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
   target handling (rule 3, read statically), the bundle checker (rules 4–5), and the target
   helpers (rule 7).
10. Maestro flow `53-settings-build-info` (number unconfirmed, from the reserved range 53–56):
    Settings shows `settings-build-info`, and on the debug build (local backend) it also shows
    `settings-build-info-test-server`.

### Acceptance Criteria

#### A production release names levapp.app everywhere it is stated
- Given `release-targets.json`, `config.ts` and `eas.json`
- When the release-target test runs
- Then `production` is `https://levapp.app/api` in all three, and the EAS `preview` profile is the table's `staging`

#### A staging bundle named production is refused
- Given a bundle containing `https://staging.levapp.app/api`, the header name and `open-spots`
- When it is checked against target `production`
- Then the check fails, naming the missing production URL and the unexpected staging URL

#### A bundle without the capability declaration is refused
- Given a bundle containing only `https://levapp.app/api`
- When it is checked against target `production`
- Then the check fails, naming `X-LevApp-Capabilities` and `open-spots`

#### A correct production bundle passes
- Given a bundle containing `https://levapp.app/api`, `X-LevApp-Capabilities` and `open-spots`, and no other known API URL
- When it is checked against target `production`
- Then the check passes

#### The release script refuses an unnamed target
- Given `scripts/ios-release.sh`
- When it is read
- Then it takes the target from its first argument, exits for anything not in the table, exports `EXPO_PUBLIC_API_URL` from the table, and runs the bundle checker before export

#### A tester sees the server in Settings
- Given the debug build signed in as `e2e-coach`
- When Settings opens
- Then `settings-build-info` shows the version, build and host, and `settings-build-info-test-server` is visible

#### Only a non-production release build warns on sign-in
- Given the target helpers
- Then `showsTestServerNotice` is true for the staging URL in a release build, and false for production, and false for any URL in a debug build

### Notes
- iOS-first by nature. The web has no counterpart: it calls `/api` on the host that serves it.
  Android (PAD-290) reuses the table and the checker when its release build exists.
- Uploading to TestFlight is `scripts/testflight-upload.sh` (altool with the ASC API key, then
  attach to the Internal group). It uploads only an export that `ios-release.sh` produced.
