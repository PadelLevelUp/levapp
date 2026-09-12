# LevelUp Mobile

Native iOS/Android client for the LevelUp padel coaching platform, talking to the same Flask backend as the web app. Part of the one-core-two-shells monorepo: all platform-agnostic logic lives in `packages/*` (`@levelup/types`, `@levelup/api`, `@levelup/hooks`, `@levelup/validation`, `@levelup/config`) and is shared with `apps/web`; this app is the native shell.

**Stack:** Expo (SDK 54) + Expo Router (file-based routing in `app/`), NativeWind (Tailwind for RN), react-native-reusables/@rn-primitives UI, TanStack Query, Zod. E2E tested with Maestro on the iOS Simulator.

## Structure

```
app/                    # Expo Router routes
  (tabs)/               # dashboard, calendar, players, messages, more
  class/[id], class/new
  player/[playerId], player/new
  conversation/[id], conversation/new
  training/             # exercises + groups
  availability.tsx, settings.tsx, login.tsx
src/
  auth/                 # AuthContext (login, token restore, push registration)
  components/           # UI kit (see src/components/ui/README.md)
  features/             # availability, calendar, dashboard, messages, players, settings, training
  lib/                  # api.ts (SecureStore token adapter), config.ts (API_URL), sse.ts, push/
.maestro/               # Maestro E2E suite (see .maestro/README.md)
scripts/e2e.sh          # E2E runner (preflight checks + DB reset + maestro test)
```

## Prerequisites

- **Node 24.15.0** via nvm (`nvm use 24.15.0`) — the repo's toolchain expects it
- **Xcode** with an iOS Simulator (the E2E suite pins iPhone 17 Pro, UDID `180A9433-4EA7-4F9B-9FD1-79E1250BD9BB`)
- **Maestro** at `~/.maestro/bin/maestro` (E2E only)
- The backend repo checked out alongside: `<repo-root>/levapp/backend` with its `.venv` set up

## Running locally (dev)

The API base URL is set in `src/lib/config.ts`: it defaults to `http://localhost:5001/api` (the E2E test backend) and is overridden with `EXPO_PUBLIC_API_URL`. The iOS Simulator shares the Mac's network, so `localhost` works; use a LAN IP for physical devices.

1. **Start the Flask backend.** For the dev DB (`levelup` on :5000):

   ```bash
   cd <repo-root>/levapp/backend && source .venv/bin/activate
   flask run --port 5000
   ```

2. **Boot an iOS Simulator** (Xcode → Open Developer Tool → Simulator, or `xcrun simctl boot <udid>`).

3. **Install dependencies at the monorepo root** (npm workspaces — this repo uses npm, not pnpm):

   ```bash
   cd <repo-root>/levapp/frontend && npm install
   ```

4. **Run the app**, pointing it at the dev backend:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_API_URL=http://localhost:5000/api npx expo run:ios   # builds + installs the dev client
   # or, once the dev build is installed:
   EXPO_PUBLIC_API_URL=http://localhost:5000/api npx expo start     # then press i
   ```

   Omit `EXPO_PUBLIC_API_URL` to hit the default `:5001` test backend instead.

## E2E tests (Maestro)

Full details, flow ordering, and gotchas: [`.maestro/README.md`](.maestro/README.md). The suite runs against the **test backend on :5001** (`levelup_test` DB) with the dev build loading JS from **Metro on :8081**.

1. **Test backend** (`POSTGRES_HOST=localhost` — never the value from `secrets.env`, that one points at prod):

   ```bash
   cd <repo-root>/levelup && source .claude/secrets.env && cd backend && \
   source .venv/bin/activate && \
   FLASK_APP=padel_app FLASK_ENV=development POSTGRES_HOST=localhost \
   POSTGRES_PORT=5432 POSTGRES_USER=padel_app_user POSTGRES_DB=levelup_test \
   JWT_SECRET_KEY=e2e-test-secret E2E_DEBUG_ENDPOINTS=true TEST_MODE=true AUTH_RATE_LIMIT_ENABLED=0 \
   flask run --host 127.0.0.1 --port 5001 --no-reload
   ```

2. **Metro:** `cd apps/mobile && npx expo start --port 8081`

3. **Run the suite** (from the `levelup` repo root; the script verifies backend/Metro/simulator, kills hung Maestro java processes, resets + seeds `levelup_test`, then runs all flows):

   ```bash
   source .claude/secrets.env               # POSTGRES_PW for the DB reset
   bash apps/mobile/scripts/e2e.sh
   ```

   Single flow, no DB reset (several flows need a fresh seed — see `.maestro/README.md`):

   ```bash
   cd apps/mobile && maestro test .maestro/flows/01-login.yaml
   ```

### Web Playwright → Maestro coverage

The flows in `.maestro/flows/` mirror the critical journeys of `apps/web/e2e/`. Summary by web spec area (the full per-spec table lives in [`.maestro/README.md`](.maestro/README.md)):

| Web spec area (`apps/web/e2e/`) | Maestro flow(s) | Gaps / notes |
|---|---|---|
| auth-onboarding | `01-login.yaml` | invite-link completion is web-only |
| dashboard | `02-coach-dashboard.yaml` | — |
| schedule-calendar | `03-class-management.yaml`, `04-attendance.yaml`, `05-class-deletion.yaml`, `14-student-calendar.yaml` | web mobile-viewport spec n/a |
| player-management / players | `06-add-player.yaml`, `07-player-notes.yaml` | level/side/sort Select portals not drivable → `08-set-player-level.skipped` (the @rn-primitives Select dropdown renders through a portal with no iOS a11y nodes, and the picker sits in a scrollable form so a coordinate tap would be flaky); delete-player and duplicate-name warnings not covered |
| evaluation-tools | `07-player-notes.yaml` | category editor not in mobile scope (read-only evaluations) |
| exercise-management | `10-exercise-crud.yaml`, `11-exercise-groups.yaml` | browse filters not in mobile scope |
| messaging | `09-direct-messages.yaml` | timezone spec skipped (no clock control in Maestro) |
| settings | `12-settings-language.yaml` | language select driven by coordinate tap; skill-levels editor outside the critical set |
| availability | `13-student-availability.yaml` | — |
| clubs, import-history, notification-engine, loading-states | — | not in mobile scope / web-only; student cancel-attendance exists on mobile but needs dedicated seeding (future flow) |

## Push notifications

`src/lib/push/` contains an `ExpoPushRegistrar` (expo-notifications) invoked fire-and-forget from `AuthContext` on login and session restore. Every step is guarded and resolves silently: it skips on simulators (`Device.isDevice`) and on denied notification permission. `PUSH_TOKEN_ENDPOINT` is `/notifications/device` — the backend's native push-token route — so an obtained Expo token is registered there (and deleted on logout). This is a separate contract from browser Web-Push, which the web app registers at `/api/notifications/save-subscription`; native iOS never calls that path.

## API contract

[`API-CONTRACT.md`](API-CONTRACT.md) documents the full backend surface (auth scheme, rolling `X-New-Token` refresh, every endpoint with request/response shapes), derived from the Flask source. The typed client in `packages/api` targets it — do not invent endpoints.

## Android (PAD-297, wave A): the CI lane

There is no Android SDK on the development Macs by decision (PAD-290 §7). The GitHub Actions
workflow **Android build** (`.github/workflows/android-build.yaml`) is the Android toolchain:

- `apk` job — `expo prebuild -p android` + `gradlew assembleRelease` on the runner, built for
  `arm64-v8a` (phones) and `x86_64` (the CI emulator) only. The APK is
  signed with the Expo template's debug keystore (installable, JS bundled, no Metro) and uploaded
  as the artefact **`levapp-android-apk`** (`app-release.apk`). Its JS points at
  `http://10.0.2.2:5001/api` — the emulator's alias for the runner — and cleartext HTTP is
  allowed by `plugins/with-ci-cleartext`, which acts only when `LEVAPP_CI_APK=1` is set at
  prebuild; the job first prebuilds WITHOUT the flag and fails if that manifest carries the
  permission, so a store build can never inherit it.
- `maestro` job — Postgres 15 + the real migrations + the E2E seed into `levelup_ci_android`,
  Flask on `:5001`, an x86_64 API 34 emulator, and Maestro running the flows in
  `MAESTRO_FLOWS` (default `flows/01-login.yaml`). `maestro-results` carries the junit report,
  Maestro's screenshots/logs and the Flask log, on success and on failure.

Flows tagged `ios-only` (today `47-push-tap-routing`, which drives `xcrun simctl push`) are
excluded on the lane until wave C brings Android push; flow 45's no-club coach comes from the E2E
seed (`e2e-coach-noclub`) and is passed to Maestro by the script (PAD-306).

Runs on every pull request into `staging` that touches `apps/mobile`, `packages/*` or the
workflow, so a branch gets its run by opening a (draft) PR. `workflow_dispatch` (input `flows`)
works once the file is on `staging`. To run more flows on a branch, change the default list in
the workflow on that branch. `npm run prebuild:android` regenerates `android/` locally for anyone
who does have the SDK; `android/` is gitignored like `ios/`.

## Releasing: regenerate the native project first

`apps/mobile/ios/` is **gitignored and only regenerated when `expo prebuild` is
explicitly run.** It is not rebuilt by `expo run:ios` against an existing
directory, so a stale native project can survive for months and get archived.

That is not hypothetical: LevApp 1.1.0 shipped with Expo's default splash
placeholder (a grey grid with concentric circles) as its native launch screen,
because the archive was built from an `ios/` directory generated before the real
splash asset landed. Users saw the placeholder flash on cold start before the JS
launch animation began — [PAD-146].

Before archiving any release:

```bash
npm run prebuild:ios     # expo prebuild -p ios --clean
npm run verify:splash    # guard: fails if the launch screen is stale/placeholder
```

`verify:splash` is a guard, not a fix — it fails the build rather than letting a
stale launch screen ship. Note that prebuild overwrites version and build numbers
from `app.json`, so set them there rather than in Xcode.
