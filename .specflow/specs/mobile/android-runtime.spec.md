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
   **A screen under a native stack header passes the header's height as
   `keyboardVerticalOffset` (PAD-487, B-265)**, through `useNativeHeaderKeyboardOffset()`
   (`src/lib/native-header-offset.ts`). The view pads by its own frame, which `onLayout` reports relative to its parent;
   under a native header that frame starts the header's height below the window's top, so with
   no offset the view shrinks too little and the bottom of the form stays under the keyboard.
   Today that is the class-request wizard and the new-conversation screen; screens that draw
   their own header inside the view, or have none, pass no offset.
   **A scrolling form whose last field can be covered scrolls it into view (PAD-487):** the
   shrink alone leaves the ScrollView's offset where it was, so the wizard's notes field, on
   focus, scrolls the form to its end once the keyboard is up (`useScrollToEndOnKeyboard`,
   `keyboardDidShow`, both platforms).

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

9. **A portalled surface must be reachable by touch and by accessibility.** Android neither
   hit-tests nor exposes to the accessibility tree a child laid out outside its parent's
   bounds, while iOS does both — and Android still draws it, so the surface looks right and is
   inert. Anything rendered through `@rn-primitives/portal` (dialog, alert dialog, select,
   menus) therefore keeps its content inside its wrapper: a wrapper whose child is absolutely
   positioned fills the overlay (`StyleSheet.absoluteFill`) and passes touches through
   (`pointerEvents="box-none"`); a wrapper whose child is in normal flow stretches
   (`alignSelf: "stretch"`, which the dialogs already carry from PAD-102). B-067 is the
   failure this rule prevents: the select's option list shrink-wrapped to 0 × 0, and no
   Android user could pick a value in any select in the app while the list sat open on screen.
   **Portalled dialogs, alert dialogs and selects carry no layout animation on Android**, entering
   or exiting (`src/lib/dialog-motion.ts`); iOS keeps a 150 ms fade both ways. The exit
   animation left a dialog drawn after React removed it (B-089 face A, PAD-314 #251). The
   entering animation could report itself finished at once and leave the content at opacity 0:
   mounted, laid out in place, but invisible and inert behind a drawn overlay (B-089 face B,
   PAD-314). It was measured, not inferred. With a mount/layout trace, flow 52 failed on
   iteration 1 with the content node present at its full bounds and reported not visible to
   the user (run 35114681841). The same build without the entering animation passed 60 of 60
   (run 35114685284).
9b. **A select's options scroll when they are taller than the list (PAD-655, B-549; number
   self-assigned, unconfirmed).** Both platforms, every select: the shared `SelectContent`
   caps the list box (max-h-96) and puts the options in a `ScrollView` that fits inside it,
   with `keyboardShouldPersistTaps="handled"` so a tap on an option is never spent dismissing
   the keyboard. `@rn-primitives/select`'s native `Viewport` is a bare fragment, so before this
   nothing in the box could scroll: a list taller than the box ran past the bottom of the
   screen, and on iOS a coach with more than about nine levels could not choose the rest
   (Edit student → Nível).
   **On Android the list stays between the system bars (PAD-727, B-605).** The app draws edge
   to edge there, so the window runs under the status and navigation bars. `SelectContent`
   gives the popper the safe-area insets plus an 8 pt gap, and caps the list to the height
   between them. A list that has no room below its trigger moves up until it fits (the
   popper's `avoidCollisions`), and its last option is never under the navigation bar. iOS
   keeps the cap and the popper's own placement, unchanged.

10. **A screen does not restyle itself in the commit that removes it.** On Android, Fabric can
   flatten a view whose style changes and reparent its children in one mount pass. If that commit
   also tears the screen down, the insert fails ("addViewAt: View already has a parent"), React
   Native destroys the surface, and the app goes blank. The verification screen did exactly this:
   a successful code confirmation reset `submitting`, which restyled all six code cells in the
   commit that navigated away. Native tags named the moved views: cell 0's digit Text, its cell,
   and the row's Pressable (B-089 face C, PAD-314). A screen that navigates away on success
   therefore leaves its busy state as it is, and resets it only on failure, where it stays on
   screen.
11. **The navigation bar never covers the app (PAD-730).** Edge-to-edge draws the app under
   Android's navigation bar (48 dp with 3-button navigation, about 24 dp with gestures), and
   that bar is transparent. So on Android the bottom inset is taken once, where it belongs:
   - the tab bar's bottom padding is the inset (at least 8 dp), and its height grows by it
     (`(tabs)/_layout.tsx`, `tabBarBottom`), so the labels sit above the buttons;
   - the root Stack pads every other screen's content by the inset (`contentStyle`), so a scroll
     ends above the bar and nothing is drawn under it. The tab navigator is excluded, because its
     bar already takes the inset;
   - a screen that added the inset itself (settings, the class-request wizard, a conversation's
     composer) adds none on Android (`useScreenBottomInset`), so nothing is padded twice.
   iOS is unchanged: its tab bar keeps 24/84 for the home indicator, and its screens keep their
   own insets. `bottom-inset.test.ts` pins the arithmetic; the Play screenshot job
   (`android-store-screenshots.yaml`, pixel_2, 3-button navigation) shows it.

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

#### A field at the bottom of a screen under a native header stays above the keyboard (PAD-487)
- **Given** the class-request wizard on iOS at the private-class step, with the native header shown
- **When** the student taps the optional-notes field, the last field before Send
- **Then** the field is above the keyboard, not under it
- **And** the wizard and the new-conversation screen pass `keyboardVerticalOffset` equal to the
  header height (`useNativeHeaderKeyboardOffset()`)

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

#### A select option can be picked on Android
- **Given** the coach is on Settings → Preferences on the emulator, the language select showing
  "English"
- **When** they open the select and tap the "Português" option by id (`settings-language-pt`)
- **Then** the language changes and "Language preference saved." appears — Maestro flow
  `12-settings-language`, the same steps on both platforms

#### A long select scrolls to its last option (rule 9b, PAD-655)
- **Given** the coach has 16 levels and opens a student's edit form on iOS
- **When** they open the level select and swipe the list up
- **Then** the last level comes into view, and tapping it chooses it and closes the list —
  Maestro flow `280-level-select-scrolls` (red on the code before the fix: six swipes and the
  last level never appeared)

#### A long select near the bottom of a form is reachable on Android (rule 9b, PAD-727)
- **Given** the coach has 16 levels and opens a student's edit form on the Android emulator
  (3-button navigation)
- **When** they open the level select and swipe the list up
- **Then** the last level is above the navigation bar, and tapping it chooses it. Maestro flow
  `280-level-select-scrolls` on the Android lane checks this: it was red before the fix, with
  levels 13–14 under the navigation bar. `select.safe-area.test.ts` pins the sizing.

#### A dialog's cancel closes the dialog on Android
- **Given** the coach is on a player's detail screen on the emulator — a screen that mounts three
  dialogs — with the remove dialog open
- **When** they tap the dialog's Cancel (`player-remove-cancel`)
- **Then** the dialog is gone within a second and the app is still on the player screen, with no
  hardware back needed — Maestro flow `49-dialog-cancel-closes`, which fails on the code before
  PAD-314 (the dialog stays drawn with nothing behind it, B-089 face A) and passes after it

#### A dialog's content is visible when it opens on Android
- **Given** the coach is on the new-class form on the emulator, with a class already on that day
- **When** they save and the overlap confirmation opens
- **Then** its Cancel and Confirm (`overlap-cancel`, `overlap-confirm`) are visible, every time.
  Maestro flow `52-dialog-overlay-rate` raises it 20 times. It failed on the code before this
  change (content at opacity 0, B-089 face B) and passes after it

#### Confirming the email code lands on the next screen on Android
- **Given** a student has just signed up on the emulator and is on the code screen
- **When** they enter the code from their email
- **Then** "Connect with a coach" (`connect-with-coach`) appears, and the device log has no
  `addViewAt` mounting exception. Maestro flow `51-verify-transition-rate` walks this 10 times
  and `44-signup` once. Both failed at the first walk on the code before this change (B-089 face
  C) and pass after it

#### Login and the calendar pass on the emulator lane
- **Given** the PAD-297 lane with `MAESTRO_FLOWS` set to `01-login`, `31-week-view` and a
  class-detail flow
- **When** it runs on this branch
- **Then** all three flows pass

#### The tab labels sit above Android's navigation buttons (rule 11)
- **Given** Android with 3-button navigation (a 48 dp bottom inset) and a signed-in coach
- **When** any tabbed screen shows
- **Then** the tab bar's bottom padding is 48 and its height 108, so the labels (Painel,
  Calendário, …) are above the back/home/recent buttons; on iOS the bar stays 24/84

#### A stack screen ends above the navigation bar, padded once (rule 11)
- **Given** Android with a 48 dp bottom inset
- **When** a player's screen is scrolled to its end, or settings, the class-request wizard or a
  conversation is open
- **Then** the last content (the player's "Pontos fortes e fracos") is above the navigation bar,
  and settings, the wizard and the composer add no second inset of their own

### Notes
- Web n/a: this leaf changes nothing on web (R-024's parity is between the shells that exist;
  Android joins iOS).
- Rule 2's Android value was decided by the first emulator run (padding); rule 6's pre-grant is
  a lane step owned by PAD-297 (`scripts/ci-android-maestro.sh`).
- OPEN: none.
