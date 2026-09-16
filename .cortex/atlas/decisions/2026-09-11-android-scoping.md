---
id: decision.2026-09-11-android-scoping
title: "Draft for the owner: LevApp on Android / Google Play — scope, waves and decisions (PAD-290)"
date: 2026-09-11T14:00:00Z
compass_rules: []
related_specs:
  - auth.mobile-universal-links
  - messaging.push-notifications
supersedes: []
sources:
  - ../../../frontend/apps/mobile/store/android/README.md
  - ../../../frontend/apps/mobile/app.json
  - 2026-09-10-sign-in-with-google.md
---

# PAD-290 — LevApp on Android / Google Play: scoping (DRAFT for the owner)

**Status:** DRAFT decision record, 2026-09-11, Session G for coordinator levapp-ee. Nothing here is
decided; §7 lists what the owner has to answer. Read-only inventory of staging `72ac170a8` plus the
open PRs named below. Nothing was installed: this Mac still has no Android SDK, emulator, `adb`,
Gradle or `eas-cli`; its only JDK is 23 (Android Gradle wants 17); Xcode 26.6 and Node 18/24 are
present.

specflow-entry: Category 4 (new capability, not yet a spec) touching both layers when built — a
business spec "the app on Android" and dev specs for Android push, App Links and the release lane.
This document is the pre-brainstorm input; no spec changes until the owner decides.

## 0. What already exists — more than the epic assumes

PAD-216 (PR #164, batch 2, 2026-09-10) did the release *preparation*, "prepare only, no publish":

- `apps/mobile/app.json` has a full `android` block: package `com.padellevelup.app`, `versionCode 1`,
  adaptive icon, `edgeToEdgeEnabled: true`, `predictiveBackGestureEnabled: false`, nine `autoVerify`
  App-Links intent filters for `/invite/player/`, `/invite/coach/`, `/register/` on `levapp.app`,
  `padellevelup.com`, `www.padellevelup.com`, and three blocked template permissions.
- `apps/mobile/eas.json` has `preview` (APK) and `production` (app bundle) Android profiles, and a
  `submit` that can only reach the **internal** track as a **draft**.
- `apps/mobile/store/android/README.md` carries the **owner-prerequisites checklist** (Play Console
  account, Expo login, signing key + Play App Signing, Firebase project + `google-services.json`,
  Play service account, audience decision), both build paths, pt/en listing text within Play's
  limits, the 512 px icon, Data-safety and IARC draft answers, and the target-audience analysis.
- `auth.mobile-universal-links` rule 7 already specifies Android App Links; its OPEN note is the
  `assetlinks.json` that needs the real signing fingerprints.
- An offline `npx expo prebuild --platform android --no-install` **exited 0** on that PR: the native
  project generates without the SDK (manifest with the intent filter, only `INTERNET` and `VIBRATE`).
  **`expo prebuild` is viable here.** Building the result is what needs JDK 17 + SDK 35 or a cloud.
- PAD-198 (parental consent) shipped in batch 2 (#178), so the audience declaration has a rule to match.

No Android binary has ever been built. No Android device or emulator has ever run the app.

## 1. Inventory — what is iOS-only today, and what is already cross-platform

Source: `apps/mobile` on staging (Expo SDK 54.0.34, React Native 0.81.5, React 19.1, expo-router 6,
`newArchEnabled: true`, no committed `ios/` or `android/` — continuous native generation).

### 1.1 Already branched for Android (never exercised)
| Area | Where | State |
|---|---|---|
| Keyboard avoidance | 10 `KeyboardAvoidingView` sites, all `behavior = ios ? "padding" : undefined` (login, signup, verify-email, forgot-password, class/new, event/new, event/[id], conversation/new, conversation/[id], AccountSetupScreen) | Android relies on `windowSoftInputMode=adjustResize` from prebuild; with `edgeToEdgeEnabled: true` and RN 0.81 this is the first thing to verify on a device — the chat composer above all (`conversation/[id].tsx:951-958`, PAD-145 history) |
| Date/time pickers | `src/components/ui/date-picker-input.tsx:71,125`, `time-picker-input.tsx:81,136` | Android path uses the imperative `DateTimePickerAndroid.open`; iOS renders an inline modal. Written, never run |
| Share | `app/player/[playerId].tsx:136-145` | `{url}` on iOS vs `{message}` on Android |
| Keyboard events | `src/hooks/useKeyboardVisible.ts:16-18` | `keyboardWill*` (iOS) vs `keyboardDid*` (Android) |
| Push registrar | `src/lib/push/expoPushRegistrar.ts:43-48,75` | creates the `default` Android channel at DEFAULT importance; sends `platform: Platform.OS` |
| Locale | `src/lib/native-locale.ts` | Android-aware comment |

There are **no** `.ios.tsx`/`.android.tsx` files, no `EXPO_OS` use, no Apple-only native module
(no expo-apple-authentication, blur, haptics, image-picker, calendar, maps, bottom-sheet or
keyboard-controller). Every native dependency in `package.json` supports Android: expo-notifications,
secure-store, device, localization, updates, clipboard, file-system, splash-screen,
`@react-native-community/datetimepicker`, gesture-handler 2.28, reanimated 4.1 + worklets (need the
new architecture — already on), screens, safe-area-context, svg, qrcode-svg, react-native-sse.

### 1.2 Will look or behave differently on Android — verify on a device, fix in wave B
1. **Elevation / shadows (13 sites).** No raw `shadowColor`/`elevation` styles anywhere; all depth
   comes from NativeWind `shadow-*` classes (`DaySheet.tsx:63`, `EventCard.tsx:107`,
   `message-context-menu.tsx:148`, `chat-more-options-menu.tsx:76`, `toast.tsx:116`, `dialog.tsx:78`,
   `alert-dialog.tsx:57`, `select.tsx:73`, `switch.tsx:18`, `card.tsx:14`, `(tabs)/availability.tsx:246`,
   `(tabs)/calendar.tsx:261,284`, `(tabs)/messages.tsx:160`; warning already at `ui/tabs.tsx:30`).
   On the new architecture RN 0.81 supports `boxShadow` on Android, but whether NativeWind emits
   it or iOS-only shadow props decides if the day sheet, cards, menus and toasts render flat. One
   emulator screenshot answers it; the fix is a shared elevation utility, not 13 patches.
2. **Keyboard + edge-to-edge** (§1.1 row 1). Android 15 (target SDK 35) forces edge-to-edge; the
   composer, the bottom tab bar and every modal need an insets check with `safe-area-context`.
3. **Hardware/gesture back.** `predictiveBackGestureEnabled: false` is set. The `DaySheet` pan sheet
   (`src/features/calendar/DaySheet.tsx:47`), dialogs, selects and context menus must close on
   back; Maestro deliberately avoids `- back` today (`31-week-view.yaml:38`, `32-month-view.yaml:50`).
4. **Conversation list** (`app/conversation/[id].tsx`): `maintainVisibleContentPosition` (:1036),
   `scrollToEnd` deferred one frame (:535,562,610), non-inverted by design (:484-507). The Fabric
   traps in the handoffs (scrollToEnd inside `onContentSizeChange` is a no-op; `opacity: 0`
   deadlocks layout callbacks) are platform-independent Fabric behaviour and the pure state machine
   (`anchor-state.ts`) is unit-tested; still the first screen to walk on Android.
5. **Badge.** `useAppBadgeSync.ts:42` calls `setBadgeCountAsync`; on Android that is launcher-
   dependent. `messaging.push-notifications` rule 6 names iOS; the spec needs an Android clause
   ("best effort, launcher permitting").
6. **Notification permission** is a runtime prompt on Android 13+; the registrar already asks on
   every platform (PAD-240), but Maestro flows will meet a system dialog iOS never showed.
7. **`userInterfaceStyle: light` needs `expo-system-ui` on Android** (prebuild warning, PAD-216
   follow-up); a native dependency, ships with the next iOS build too.
8. **Splash and fonts.** `expo-splash-screen` config is platform-neutral; `verify-native-splash.sh`
   checks only `ios/`. Fonts load from `@expo-google-fonts` per weight (the R-025 rule) — fine.
9. **Deep links.** `scheme: levelup` works unchanged; App Links need `assetlinks.json` (owner keys).
10. **SSE, SecureStore, expo-updates, QR** — no platform code; expected to work.

### 1.3 Maestro
36 flows in `.maestro/flows/` (28 ordered in `config.yaml`), all `appId: com.padellevelup.app`,
~530 `tapOn: {id:}` testID selectors, a handful of text selectors — mostly portable. Android deltas
to expect: the notification-permission dialog, the `back` semantics above, Select portals (an iOS
a11y workaround at `02-coach-dashboard.yaml:4`, `09-direct-messages.yaml:58`), keyboard dismissal.
`scripts/e2e.sh` hardcodes the iOS simulator UDID and `xcrun simctl`; `push-tap-flow.sh` is
`simctl push` (APNs) only.

## 2. Push — FCM alongside the current path

**Today.** The app fetches an **Expo push token** (`getExpoPushTokenAsync` with the EAS project id
`dc8bbf5f-…`), never a raw APNs/FCM token, and registers it at `POST /api/notifications/device`
with `{token, platform}`; `DELETE` on logout. The backend (`utils/expo_push.py`) posts batches of
100 to `https://exp.host/--/api/v2/push/send` with `to/title/body/data` (+ `badge` on message-backed
pushes), 10 s timeout, **no Expo access token**, and reads only the synchronous tickets (no
`getReceipts` polling); `DeviceNotRegistered` deletes the row. `DeviceToken` has `user_id`, `token`
(plaintext) and a **nullable, unvalidated `platform`** (`notifications_api.py:24-47` stores whatever
the client sends; nothing server-side ever reads it). PAD-269 (#194, migration `95bfee084ad1`) makes
uniqueness `(user_id, token)` so registering never steals another user's row. PAD-294 (#212) moves
the HTTP call onto a bounded in-process sender (`utils/push_sender.py`) that is channel-agnostic.
Web push is a separate VAPID path (one subscription per user, `url`-routed). Pre-existing gaps that
are not Android's but surface when a second platform arrives: `replacement_approval_service.py:266`
sends web push only; request alerts send no `badge`.

**Android.** An Expo push token is platform-neutral: the same service delivers to **FCM** once
(a) the Android build carries `google-services.json` and `android.googleServicesFile` in
`app.json`, and (b) the Firebase project's **FCM V1 service-account key** is uploaded to the EAS
project's Android credentials. Both are owner console steps (already on the PAD-216 checklist).
The backend therefore keeps one sender and one token type. Changes that remain:

| Where | Change | Size |
|---|---|---|
| `expo_push.py` message | add `channelId: "default"` (Android 8+ needs a channel; without it Expo falls back to a default that may be silent) and `priority: "high"` so reminders arrive with the app killed; `badge` stays (iOS-only, ignored on Android) | small |
| `notifications_api.py` device route | validate `platform ∈ {ios, android}` and make it required for new rows (today nullable, stored as sent, never read) | small |
| `expo_push.py` auth | send `Authorization: Bearer $EXPO_ACCESS_TOKEN` (Expo's optional push-security setting) before a second platform doubles the token population; config knob + secret | small |
| `DeviceToken` | no schema change (`platform` exists, uniqueness per user already) | none |
| `push_sender.py` (PAD-294) | none | none |
| Registrar (`expoPushRegistrar.ts:43`) | channel importance to HIGH for heads-up reminders; consider `messages`/`reminders` channels later so users can mute one | small |
| Spec `messaging.push-notifications` | Android clauses on channel, badge best-effort, tap routing unchanged (`usePushNotificationRouting.ts` is expo-notifications, platform-neutral) | spec |
| Tests | `test_native_push.py` gains an `android` platform case and the payload fields | small |

**Alternative rejected by default:** direct FCM from the backend (`firebase-admin`) — a second
sender, a second credential, and raw FCM tokens next to Expo tokens in `device_tokens`. Only worth it
if Expo's service becomes a cost or reliability problem; neither is on record.

**Cannot be verified without a device or emulator with Play services** — push is the one wave that
needs the owner's Firebase step before any engineering can be checked end to end.

## 3. Sign-in — what Play requires, and PAD-252

**Google Play does not require Google Sign-In.** Apple's guideline 4.8 (offer an equivalent
privacy-preserving login if you offer a third-party one) has no Play counterpart. LevApp's
email + password login (username + password JWT, SecureStore) satisfies Play as is. What Play
*does* require of an app with accounts: a public privacy-policy URL (exists), the Data-safety form
matching reality (drafted in PAD-216; **B-038** — the policy does not yet name the AI import
processor or the EEA transfer — must be fixed first, because the form and the policy are compared),
and since 2024 an **account-deletion path discoverable outside the app** (a public web URL that
explains or performs deletion; LevApp has in-app deletion via PAD-268, so this is a static page or
a policy section with a link, not new behaviour).

**PAD-252 stays parked**, as the 2026-09-10 decision draft recommends: Google + Apple together,
~7 days, when the owner wants social sign-in. Android changes one thing in that draft: the iOS row
("native Google Sign-In and expo-apple-authentication config plugins") becomes an iOS **and Android**
row (`@react-native-google-signin/google-signin` or expo-auth-session builds for both; Apple sign-in
on Android is a web flow), about +1 day. Android is **not** on the sign-in critical path and
sign-in is not on the Android critical path.

## 4. Build + CI

**Today's iOS lane** is manual on this Mac: `expo prebuild -p ios --clean`, prebuilt-artifact
workaround (the Maven redirect trap), `xcodebuild archive`, `altool` upload with the ASC API key,
then the REST attach to the internal TestFlight group. Nothing in `.github/workflows/` builds a
mobile binary.

### Options
| Lane | Needs | Pros | Cons |
|---|---|---|---|
| **A. GitHub Actions + Gradle** (`build-android.yaml`: `npx expo prebuild -p android`, `./gradlew bundleRelease`/`assembleRelease`, artifact upload; later `eas submit` or the Play publisher API to the internal track) | upload keystore as a base64 secret + passwords; `versionCode` from the run number | GitHub-hosted `ubuntu-latest` runners ship JDK 17 and the Android SDK — nothing to install anywhere; deterministic; free at this volume; same PR-gated flow as the deploys | ~15–25 min per build; keystore lives in GitHub secrets (Play App Signing holds the real key, so an upload-key leak is recoverable) |
| **B. EAS Build (cloud)** — the PAD-216 README's recommended path | Expo login as `levapps-team`, EAS free tier (limited monthly builds, queue waits) or a paid plan | zero config beyond `eas.json`; credentials (keystore, FCM key) managed by Expo; `eas submit` built in | vendor dependence and quota; another account to keep pointed at `admin@levapp.app` |
| **C. Local Android Studio on this Mac** | `brew install --cask android-studio zulu@17`, SDK 35, an emulator image (~10 GB, owner approval per the no-install rule) | fastest inner loop for wave-B fixes; emulator for Maestro | this machine is already at load 100–300 with six sessions; an emulator boot competes with the iOS simulator and Playwright |

**Recommendation:** A for release builds (with B as the documented fallback), and **no Android
SDK on this Mac** unless the owner wants the inner loop here. For Maestro on Android: a nightly
GitHub Actions job with `reactivecircus/android-emulator-runner` (Linux runners support KVM) running
the flows against the E2E backend in a service container — the flows are testID-based, so the
Android deltas (§1.3) are a bounded fix list. Release QA on a **physical Android phone** (push,
App Links and Play services cannot be fully trusted on an emulator).

**Signing:** generate the upload keystore once (`keytool`, or let EAS do it), enrol the app in
Play App Signing at creation, record both SHA-256 fingerprints (they go into `assetlinks.json`).
**OTA:** `expo-updates` is configured (`runtimeVersion: appVersion`, `u.expo.dev`); a Gradle-built
binary receives EAS Updates like an EAS-built one if the iOS lane ever adopts them — to confirm.
**versionCode:** `eas.json` has `autoIncrement: false`; lane A derives it from the CI run number.

## 5. Store — Play Console listing

From the PAD-216 README, what is done and what is left:

| Item | State |
|---|---|
| Listing title, short + full description pt-PT/en | drafted, within limits, **no push claim** (add it after §2) |
| 512 px icon | done (`store/android/icon-512.png`) |
| Feature graphic 1024×500 | to make (brand navy, lockup, one line) |
| Phone screenshots 2–8, long side ≤ 2× short | to make from an emulator at 1080×1920; the iOS set (1320×2868) is rejected. **Fictional names only** — reuse the 2026-09-07 repaint mapping (Bruno Tavares as coach, Paulo Pires, Tiago Paiva, Joana Teixeira, …) so avatars keep their initials |
| Data safety form | drafted; must match the privacy policy → fix B-038 first |
| IARC content rating | drafted (lowest rating with "users interact") |
| Target audience | owner decision (§7.6); PAD-198 shipped, so the consent rule exists to match |
| Account-deletion URL | needed (Play policy); a public page on `levapp.app` |
| App Links `assetlinks.json` on both domains | after the keys exist; served by the web deploy |

**Review lead time.** A new Play developer account goes through identity verification (days).
A **personal** developer account created after November 2023 must run a **closed test with at
least 12 testers opted in for 14 continuous days** before it may apply for production access;
**organisation** accounts are exempt. Production reviews then take hours to a few days, longer for
an app that declares users under 13 (Families policy). Plan **three to four weeks** from account
creation to a public listing under a personal account, two under an organisation account.

## 6. Waves, effort, child tickets

Effort is engineering days at the pace of this team's tickets; owner console steps are listed
separately because they gate the waves. Ordered so each wave produces something the owner can hold.

| Wave | Goal | Eng. days | Owner steps that gate it | Child tickets to file under PAD-290 |
|---|---|---|---|---|
| **A — first APK** | a signed-by-debug-key APK from CI the owner can install | 1 | none (Expo login only if lane B) | A1 `build-android.yaml` (prebuild + Gradle, artifact); A2 `prebuild:android` script, `expo-system-ui`, `verify-native-splash` for Android; A3 Node/JDK pins in the workflow |
| **B — it works on Android** | every screen walked on a device/emulator, deltas fixed, Maestro green on Android | 4–6 | a physical phone (or the emulator lane) | B1 elevation utility for the 13 shadow sites; B2 keyboard + edge-to-edge insets; B3 back-button closes sheet/dialog/select/menus; B4 date/time pickers + Share on Android; B5 conversation list on Android; B6 notification-permission prompt and badge clause (spec); B7 Maestro on an Android emulator in CI + flow deltas; B8 `store/android` screenshots with fictional names |
| **C — push on Android** | a reminder and a message push arrive on a phone with the app killed and open the right screen | 1–2 | Firebase project, `google-services.json`, FCM V1 key uploaded to Expo credentials | C1 backend `channelId`/`priority`, platform enum, tests, spec clauses; C2 registrar channel importance; C3 device verification checklist (push tap cannot be asserted by Maestro on iOS either — same standard) |
| **D — store** | internal-track build, then closed test, then production | 2–3 (+ 3–4 weeks lead) | Play account, signing key + Play App Signing, service account for submit, audience decision, B-038 policy text | D1 signed release lane + Play internal upload; D2 `assetlinks.json` on both domains (web deploy); D3 feature graphic; D4 Data safety + IARC + deletion URL; D5 closed-test tester recruitment (12 for 14 days) or org account |
| **E — parity as a rule** | Android is part of every ticket like iOS | 0.5 + ongoing | rule change in `.claude/CLAUDE.md` (owner) | E1 "web, iOS and Android ship together" in CLAUDE.md, frontend/CLAUDE.md, the ticket skill's parity gate; E2 weekly-qa covers Android; E3 release note template gains a Play line |

**Total: 9–13 engineering days** plus owner console work (about half a day spread over weeks) plus
the store lead time. Waves A and B need no owner decision beyond "go"; C and D are gated.

## 7. Owner decisions — one sentence each, recommended default first

1. **Play account type:** open a *personal* developer account under `admin@levapp.app` now (default,
   matches the Apple arrangement) and accept the 12-tester/14-day closed test, or wait for the legal
   entity and an organisation account that skips it.
2. **Build lane:** GitHub Actions + Gradle as the release lane, EAS as fallback (default), or EAS only.
3. **Android SDK on this Mac:** no (default) — CI builds, CI emulator for Maestro, a phone for QA;
   yes only if the owner wants the inner loop locally and accepts the load.
4. **Push transport:** stay on the Expo push service with FCM V1 credentials (default) — one sender,
   one token type — rather than direct FCM.
5. **Sign-in:** launch Android with email + password and keep PAD-252 parked (default); if social
   sign-in is wanted, Google + Apple together on all three platforms (~8 days).
6. **Target audience:** declare the age groups the PAD-198 consent rule admits, under-13 included,
   and accept Families-policy review (default), or declare 13+ and make Android sign-up refuse minors.
7. **App Links:** publish `assetlinks.json` on `levapp.app` and `padellevelup.com` as soon as the
   fingerprints exist (default yes).
8. **Parity rule:** extend "web and iOS ship together" to Android from the first production release
   (default), with internal-testing builds exempt until then.
9. **Release cadence:** an internal-track Android build per staging batch, mirroring TestFlight
   (default), or only at prod promotion.
10. **Test device:** buy or borrow one mid-range Android phone on Android 14/15 (default yes) for
    push, App Links and release QA.
11. **Privacy policy (B-038) before Play submission:** yes (default) — the Data-safety form is
    checked against it.
12. **Go for waves A and B now, C and D after the console steps** (default), or hold the epic until
    the Play account exists.

## Sources
- PAD-290, PAD-216 (+ PR #164 body), PAD-269 (#194), PAD-294 (#212), PAD-252 and
  `.cortex/atlas/decisions/2026-09-10-sign-in-with-google.md`, PAD-198 (#178).
- `apps/mobile/app.json`, `eas.json`, `store/android/README.md`, `package.json`, `.maestro/`.
- `.specflow/specs/auth/mobile-universal-links.spec.md` rule 7; `messaging/push-notifications.spec.md`.
- Memory notes: iOS FlatList Fabric traps, Maestro on the pinned simulator, simulator push tap,
  RN prebuilt artifacts Maven redirect, TestFlight upload via ASC API key, marketing screenshots
  no real names; `docs/handoffs/2026-09-10-staging-batch-2-testflight-17.md`,
  `docs/handoffs/2026-09-11-orchestrating-parallel-sessions.md`.
