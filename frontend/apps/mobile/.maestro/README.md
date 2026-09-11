# LevelUp Mobile — Maestro E2E Suite

Maestro UI tests for the LevelUp mobile app (`com.padellevelup.app`), mirroring
the critical journeys of the web Playwright suite (`apps/web/e2e/`) for the
features the mobile app implements.

## Prerequisites

1. **Backend** — Flask on `:5001` against the `levelup_test` DB
   (`POSTGRES_HOST=localhost`, never the value from `secrets.env` — that one
   points at prod):

   ```bash
   cd <repo-root>/levapp && source .claude/secrets.env && cd backend && \
   source .venv/bin/activate && \
   FLASK_APP=padel_app FLASK_ENV=development POSTGRES_HOST=localhost \
   POSTGRES_PORT=5432 POSTGRES_USER=padel_app_user POSTGRES_DB=levelup_test \
   JWT_SECRET_KEY=e2e-test-secret E2E_DEBUG_ENDPOINTS=true TEST_MODE=true \
   flask run --host 127.0.0.1 --port 5001 --no-reload
   ```

2. **Metro** — the dev build loads JS from Metro on `:8081`:

   ```bash
   cd apps/mobile && npx expo start --port 8081
   ```

3. **Simulator** — iPhone 17 Pro, UDID `180A9433-4EA7-4F9B-9FD1-79E1250BD9BB`,
   with the dev build of `com.padellevelup.app` installed and AutoFill password
   prompts disabled.

4. **Maestro** — installed at `~/.maestro/bin/maestro`.

## Running

```bash
source .claude/secrets.env               # repo root; POSTGRES_PW for the DB reset
bash apps/mobile/scripts/e2e.sh          # resets the DB, then runs all flows
```

Or manually (no DB reset — several flows need a freshly seeded DB, see below):

```bash
cd apps/mobile
maestro test .maestro                             # whole suite (ordered via config.yaml)
maestro test .maestro/flows/01-login.yaml         # single flow
```

Do NOT run the bare folder (`maestro test .maestro/flows`) for a full run:
Maestro does not guarantee execution order there, and 03→05 and 04→14 are
order-dependent. `config.yaml`'s `executionOrder.flowsOrder` pins the order.

## Structure

- `config.yaml` — Maestro workspace config; pins the numbered flow order.
- `flows/` — the suite. Each file header comments which web spec it mirrors.
- `subflows/` — reusable pieces (`login-coach`, `login-student`, `login`,
  `logout`, `goto-seeded-monday`) invoked via `runFlow`.
- `scripts/seeded-monday.js` — computes the seeded class date (next Monday)
  and tomorrow's date for `${output.*}` interpolation.

### Order/state dependencies

- The DB must be **freshly seeded** for a full run: flow 09 consumes the
  seeded unread message, and flows create/delete fixtures by fixed names.
- `03-class-management` creates "Maestro Test Class"; `05-class-deletion`
  deletes it.
- `04-attendance` marks E2E Student present; `14-student-calendar` then sees
  "Present" (it also accepts "Invited" so it can run standalone).
- Seeded ids on a fresh DB are deterministic: player `1` = E2E Student,
  conversation `1` = coach↔student.

## Web spec → Maestro flow mapping

| Web spec (`apps/web/e2e/`) | Maestro flow / status |
|---|---|
| auth-onboarding/login.spec.ts | `01-login.yaml` |
| availability/student-blockers.spec.ts | `13-student-availability.yaml` |
| clubs/coach-invitation.spec.ts | not applicable — club/coach invitations not in mobile scope |
| dashboard/coach-dashboard.spec.ts | `02-coach-dashboard.yaml` |
| evaluation-tools/eval-categories.spec.ts | not applicable — category editor not in mobile scope (mobile shows read-only evaluations) |
| evaluation-tools/player-notes.spec.ts | `07-player-notes.yaml` |
| exercise-management/browse-exercises.spec.ts | list view covered by `10-exercise-crud.yaml`; browse filters not in mobile scope |
| exercise-management/exercise-crud.spec.ts | `10-exercise-crud.yaml` |
| exercise-management/exercise-groups.spec.ts | `11-exercise-groups.yaml` |
| import-history/import-confirm-504.spec.ts | not applicable — import tooling is web-only |
| import-history/import-history.spec.ts | not applicable — import tooling is web-only |
| loading-states/ticket-pad-24-loading-states.spec.ts | not applicable — web-specific loading-state spec (mobile skeletons are exercised implicitly by every flow's waits) |
| messaging/direct-messages.spec.ts | `09-direct-messages.yaml` |
| messaging/message-timestamp-timezone.spec.ts | skipped: timezone assertions need clock control Maestro does not provide (timestamps rendering is implicitly covered by 09) |
| messaging/participant-role-header.spec.ts | `09-direct-messages.yaml` (chat-header-role assertion) |
| notification-engine/auto-reminder.spec.ts | not applicable — notification engine not in mobile scope |
| notification-engine/cancel-attendance.spec.ts | not covered — mobile has student cancel-attendance, but the journey destroys the seeded presence other flows rely on; needs dedicated seeding (future flow) |
| notification-engine/notification-config.spec.ts | not applicable — notification engine not in mobile scope |
| notification-engine/reminder-flow.spec.ts | not applicable — notification engine not in mobile scope |
| notification-engine/semi-auto-approval.spec.ts | not applicable — notification engine not in mobile scope |
| player-management/add-player.spec.ts | `06-add-player.yaml` |
| player-management/player-invite-completion.spec.ts | `20-add-player-invite.yaml` (coach-side half only — creating the player and reading back the `/invite/player/<token>` link; the player's own profile-completion form is a public web route, not a mobile screen) |
| player-management/create-player-level-dropdown.spec.ts | skipped: level picker is a Select portal (invisible to the a11y tree, see below) |
| player-management/delete-player.spec.ts | not covered — mobile supports remove; excluded to keep the seeded roster intact for later flows |
| player-management/duplicate-name-warning.spec.ts | not covered — warning exists on mobile; outside the critical-journey set |
| player-management/duplicate-username-warning.spec.ts | not covered — same as above |
| player-management/level-formatting.spec.ts | not applicable — web-specific formatting spec |
| player-management/player-invite-completion.spec.ts | not applicable — invite-link completion is a web flow |
| player-management/player-search-pagination.spec.ts | search covered by `06`/`07`; pagination buttons exist but are outside the critical-journey set |
| player-management/player-side-both.spec.ts | skipped: side picker is a Select portal |
| player-management/players-sort-filter-alerts.spec.ts | skipped: sort is a Select portal; alert filters outside the critical set |
| player-management/search-edit-player.spec.ts | search + detail covered by `07-player-notes.yaml`; inline edit not covered (level/side pickers are Select portals) |
| players/set-player-level.spec.ts | skipped — see `flows/08-set-player-level.skipped` (Select portal not drivable) |
| schedule-calendar/attendance.spec.ts | `04-attendance.yaml` |
| schedule-calendar/class-date-prepopulate.spec.ts | covered inside `03-class-management.yaml` (date pre-populated from the selected day) |
| schedule-calendar/class-deletion.spec.ts | `05-class-deletion.yaml` |
| schedule-calendar/class-detail-privacy.spec.ts | `14-student-calendar.yaml` (student sees no coach controls) |
| schedule-calendar/class-management.spec.ts | `03-class-management.yaml` |
| schedule-calendar/daily-schedule.spec.ts | covered by `03`/`14` (day list + student view) |
| _(no web spec — web's `EventDetailSheet` journey)_ | `21-event-detail.yaml` — create/open/edit/delete a non-class calendar event (PAD-160) |
| schedule-calendar/mobile-weekly-order.spec.ts | not applicable — web mobile-viewport spec; the WeekStrip is exercised by `goto-seeded-monday` |
| settings/coach-settings.spec.ts | profile/settings screen covered by `12`; skill-levels editor outside the critical set |
| settings/language-preference.spec.ts | `12-settings-language.yaml` (coordinate tap, see limitations) |
| settings/notification-engine-settings.spec.ts | not applicable — notification engine not in mobile scope |

## Known limitations & gotchas

- **@rn-primitives Select portals are invisible to the iOS a11y tree.**
  The dropdown options render (visually) through a portal that exposes no
  accessibility nodes — verified with `maestro hierarchy` while a dropdown
  was open. Flows must not select from Select components. Flow 12 drives the
  language select by screen-percentage tap (fixed layout, verified by the
  "Language preference saved." status); flow 08 is skipped outright.
- **Never use unbounded `eraseText`** — it crashes the iOS driver. Always
  bound it (`eraseText: 40`) or design flows to type into empty fields.
- **Keyboard vs taps**: Maestro taps element coordinates even when the
  keyboard covers them. Dismiss the keyboard first — a short drag on the
  scroll view (`keyboardDismissMode="on-drag"` forms) or a tap on an empty
  list area (conversation screen) — before tapping buttons low on the screen.
- **`retryTapIfNoChange: false`** on taps that toggle state (message bubble
  selection, select triggers): Maestro's default re-tap toggles them back.
- **Login typing is retry-verified** (see `subflows/login.yaml`): dev-build
  bundle reloads can remount the login screen and wipe typed text. Flows
  relaunch WITHOUT `clearState` and log out through the UI instead — a
  clearState relaunch right after an authenticated session triggers a
  delayed remount that wipes the fields.
- **Hung Maestro java processes** from aborted runs break the next driver
  launch ("terminate for debugging launch request") — `scripts/e2e.sh` kills
  them before running.
- **Transient XCTest driver aborts**: occasionally a flow dies within
  seconds with `kAXErrorInvalidUIElement` (stale accessibility handle while
  the app relaunches); the next flow is fine. `scripts/e2e.sh` re-runs
  failed flows once, individually and in order — assertions unchanged, so a
  real failure still fails twice. A long-booted simulator makes this more
  frequent; reboot it if flakes cluster.
- **Inverted FlatLists are broken on Fabric** (wrong a11y frames + broken
  hit-testing). The conversation screen intentionally uses a non-inverted
  list anchored with `scrollToEnd` — don't reintroduce `inverted`.
- The suite runs against the **dev build + Metro**; screenshots in
  `~/.maestro/tests/` are the first debugging stop.

## Push tap routing (PAD-240)

`flows/29-push-tap-routing.yaml` is not in `config.yaml`'s order because Maestro
cannot send a push. Run it through the wrapper, which delivers a simulated APNs
notification (`scripts/push-payloads/message.apns`, `xcrun simctl push`) once the
flow is parked on the Messages tab, then lets the flow tap the banner and assert
the conversation opened:

```bash
bash apps/mobile/scripts/push-tap-flow.sh          # optional arg: simulator UDID
```

## Android (PAD-298, wave B)

The same flows run on the CI emulator lane (`.github/workflows/android-build.yaml`, PAD-297:
API 34 `pixel_6`, the APK from `expo prebuild` + Gradle, flows from `MAESTRO_FLOWS`).

**Flow policy.** A pull request runs the smoke list only (`01-login`, `31-week-view`,
`32-month-view`, `36-android-evidence` — about 6 minutes after the APK). The whole suite
(config.yaml's order, continue-on-failure, ~60 minutes of emulator time) runs nightly at
03:00 UTC on staging and on demand: Actions → "Android build" → Run workflow with
`flows` = `.` (the default). Read failures in the `maestro-results` artefact.

Deltas against the iOS suite — `mobile.android-runtime` rule 8:

- **`- back` is meaningful.** On Android it closes the newest open dialog / select / menu,
  drops a raised day sheet back to rest, or goes back a screen. iOS flows still tap the
  screen's own back button (`- back` is a no-op there).
- **Notification permission.** Android 13+ shows a system dialog at push registration; the
  lane grants `POST_NOTIFICATIONS` with `adb shell pm grant` before the flows, so no flow
  handles it.
- **Keyboard.** `pressKey: Enter` still dismisses a single-line input; `hideKeyboard` works on
  Android (it fails on iOS in this app) — flows use `runFlow: { when: { platform: Android } }`
  blocks for it (06, 20).
- **Taps by label text miss on Android.** `tapOn: "<accessibilityLabel>"` found nothing on the
  emulator (16, 34); every control a flow taps needs a testID (`class-notify-cancel`,
  `player-back`, `player-remove-cancel` were added, PAD-304).
- **Platform-conditional steps** (`runFlow: when: platform: Android|iOS`) carry the iOS
  workarounds (Select percent taps in 12, picker `-confirm` in 13) next to the Android path.
- **The system navigation bar is transparent** (edge-to-edge): a list's last row can sit under
  the 3-button bar and a centre tap hits Home (the Settings logout row, ~1 run in 5). Screens
  pad their scroll content by the bottom safe-area inset (`app/settings.tsx`); a flow should
  not need `centerElement` (it times out at the end of the content on iOS).
- **Select portals** are in the Android a11y tree as ordinary views — the iOS workaround
  (percent taps in `12-settings-language`) stays until both are verified.
- **Pickers** are Android's own dialogs (`DateTimePickerAndroid`): tap the dialog's OK by
  text, not a testID.
- **Push**: `push-tap-flow.sh` is `simctl` (APNs) only; no Android equivalent yet (wave C).
- `36-android-evidence.yaml` is Android-only and not in `config.yaml`: it takes the
  screenshots the build Mac cannot produce (login keyboard, week sheet depth, raised month
  sheet + back, the date dialog); read them in the lane's `maestro-results` artefact.
