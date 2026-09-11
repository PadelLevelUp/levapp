---
id: mobile.android-runtime
status: draft
depends_on: [calendar.mobile-views, messaging.push-notifications, training.tactical-board]
implements: ../../specs-business/mobile/app-runs-on-android.business.md
governed_by: []
---

# mobile.android-runtime

### Intent
The Expo app (`frontend/apps/mobile`) was built and verified on iOS only. Every
`Platform.OS` branch written "for Android" has never run, and the iOS-only pieces of the
platform (raw shadow props, the hardware back button, edge-to-edge keyboards, the
notification permission prompt) have no Android answer. This leaf says what the app does on
Android and how it is verified — on the CI emulator lane from PAD-297, because the build Mac
has no Android SDK or emulator (PAD-298, wave B of the 2026-09-11 Android scoping decision — `.cortex/atlas/decisions/2026-09-11-android-scoping.md`, landing with #214; the provenance link is added once that file is on staging).

### Entities
- **READS:** nothing new — the same screens, queries and `DeviceToken.platform` as iOS.
- **WRITES:** nothing new.

### Rules

#### Depth and chrome
1. **Shadows come from the class names, on both platforms.** Depth is declared with NativeWind
   `shadow-*` utilities; on an Android bundle NativeWind compiles them to `elevation` (its
   default scale: `sm` 1, `md` 6, `lg` 8), so the thirteen `shadow-*` sites render depth on
   Android with no per-site change. A component that sets iOS shadow props directly
   (`shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`, today only the day
   sheet's outer view, PAD-286) must set `elevation` beside them, on the same view, so
   Android renders depth too (Android ignores the iOS props and iOS ignores `elevation`).

#### Keyboard
2. **One keyboard-avoidance policy.** Every `KeyboardAvoidingView` takes its `behavior` from
   `keyboardAvoidingBehavior()` in `src/lib/keyboard-avoiding.ts` — `"padding"` on both
   platforms. Under `edgeToEdgeEnabled` the Android window does not resize for the keyboard
   (verified on the PAD-297 emulator, run 34637032903: with `behavior` unset the keyboard
   covered the login screen's Sign In button), so Android pads exactly like iOS. If a screen
   ever needs a different value, that one function changes, not ten screens.
   `useKeyboardVisible` keeps `keyboardDid*` on Android (there are no `will` events there).

#### Back button
3. **The hardware / gesture back closes the topmost transient surface first.** A registry in
   `src/lib/android-back.ts` keeps the open surfaces in order; on Android the newest one wins
   the `hardwareBackPress` event and closes itself; with nothing registered the event is left
   to the navigator (screen back). Registered surfaces: `Dialog`, `AlertDialog` and `Select`
   content (they live in Portals, not in a `Modal`, so nothing closes them otherwise), the
   message context menu and the chat more-options menu, and the Semana / Mês day sheet, which
   registers only while raised above its resting height and drops back to it (rule 18 of
   `calendar.mobile-views`). On iOS the registry is inert.

#### Platform conventions
4. **Date and time pickers** open Android's own dialogs (`DateTimePickerAndroid.open`, `set`
   commits, `dismissed` leaves the value) — the branch that exists today, kept; iOS keeps its
   inline modal.
5. **Share** passes `{ message }` on Android (`{ url }` on iOS, which is the existing branch);
   Android's sheet ignores `url`.
6. **Notification permission** is requested at push registration on Android 13+ as it is on
   iOS (PAD-240); the emulator lane grants `POST_NOTIFICATIONS` before the flows so no system
   dialog interrupts them. The app-icon badge is best effort on Android — launcher permitting —
   and a failed `setBadgeCountAsync` is swallowed (`messaging.push-notifications` rule 6).
7. **System UI:** `userInterfaceStyle: light` and the splash are honoured through
   `expo-system-ui` and the Android prebuild (wave A, PAD-297).

#### Verification
8. **Green means green on the emulator.** A wave-B slice is done when the Maestro flows that
   cover it pass on the PAD-297 lane (`android-build.yaml`, `MAESTRO_FLOWS`); the unit tests
   here pin the decisions the lane cannot see (rules 2 and 3). Flow deltas for Android are
   recorded in `.maestro/README.md`: Select portals, keyboard dismissal, `- back` is now
   meaningful, no `simctl` push.

### Acceptance Criteria

#### The day sheet has depth on Android
- **Given** the Semana day sheet's outer view style
- **When** it is read on Android
- **Then** it carries `elevation` ≥ 8 beside the iOS shadow props, so the sheet's edge is visible
  over the grid

#### Keyboard avoidance follows one policy
- **Given** `Platform.OS` is `ios`, then `android`
- **When** `keyboardAvoidingBehavior()` is called
- **Then** it returns `"padding"` both times
- **And** all ten `KeyboardAvoidingView`s take their `behavior` from it
- **And** on the emulator the login screen's Sign In button stays above the keyboard

#### Back closes the newest surface first
- **Given** a dialog is open and a context menu is opened over it on Android
- **When** the back button is pressed three times
- **Then** the menu closes, then the dialog closes, then the navigator gets the third press
- **And** a surface that was closed by other means is no longer in the registry

#### A raised day sheet drops back on back
- **Given** `Mês` on Android with the day sheet dragged above its resting height
- **When** the back button is pressed
- **Then** the sheet returns to its resting height and the add buttons come back
- **And** a second press goes to the navigator

#### Login and the calendar pass on the emulator lane
- **Given** the PAD-297 lane with `MAESTRO_FLOWS` set to `01-login`, `31-week-view` and a
  class-detail flow
- **When** it runs on this branch
- **Then** all three flows pass

### Notes
- Web n/a: this leaf changes nothing on web (R-024's parity is between the shells that exist;
  Android joins iOS).
- Rule 2's Android value was decided by the first emulator run (padding); rule 6's pre-grant is
  a lane step owned by PAD-297 (`scripts/ci-android-maestro.sh`).
- OPEN: none.
