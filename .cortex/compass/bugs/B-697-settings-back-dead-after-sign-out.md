---
id: B-697
title: "After signing out from Settings and back in, Settings' native back did nothing on the second visit (iOS)"
type: incomplete-rule
severity: high
status: resolved
affects:
  - auth.logout
  - frontend/apps/mobile/app/(tabs)/_layout.tsx
proposed_fix: "auth.logout rule 7: the signed-out tabs reset the root stack to the login screen alone, so a sign-in starts from exactly one (tabs)."
opened: 2026-10-28T17:30:00Z
resolved: 2026-10-28T18:00:00Z
---

# B-697: Settings' back went dead after a sign-out

**Source:** the owner's report (Linear PAD-777): the second entry into Definições through the top
avatar had a back button that did nothing.

**What happens:** sign out from Settings, sign in again, open Settings from the avatar and tap back:
it works. Open it again: the native back (`BackButton`) is shown and enabled, and taps do nothing,
however many. Only after a sign-out in the same app session; a relaunch hides it.

**What should happen:** the back returns to the tabs on every visit.

**Root cause:** auth.logout said nothing about where the app lands after a sign-out (incomplete
rule). The signed-out tabs rendered `<Redirect href="/login">`, which replaces the FOCUSED route.
After a sign-out from Settings that was Settings, so the root stack went from `[(tabs), settings]` to
`[(tabs), login]`, and the sign-in's `router.replace` made it `[(tabs), (tabs)]`. On iOS the second
pop of Settings over the doubled stack was swallowed. Why react-native-screens drops that pop was
not traced; the doubled stack is the observed difference between pass and fail.

**Evidence (2026-10-28, iPhone 17 Pro simulator, Maestro):**
- Reproduced with no edits: round 1's back left, round 2's did not (also not on 3 more taps).
- Ruled out: `usePreventRemove` removed, still dead. Settings' header options cut to
  `headerShown`, still dead.
- Control: the unchanged screen passes 3 of 3 when the app is relaunched signed in, with no sign-out.
- A root-stack log on each Settings render: `[(tabs) VcO62, (tabs) iGEQ5, settings]` after the
  sign-out and sign-in; `[(tabs), settings]` with the fix, and 3 of 3 rounds pass.

**Fix:** `app/(tabs)/_layout.tsx`: the signed-out branch renders `SignedOutReset`, which calls
`navigation.reset({ index: 0, routes: [{ name: "login" }] })` on the root stack. It covers any
sign-out while a screen is pushed over the tabs (Settings, delete account, a 401). Web is untouched:
a browser renders one route at a time and its history holds URLs, not mounted screens; sign-out
navigates to `/auth` and `ProtectedRoute` redirects any protected URL reached through Back.
Tests: flow `308-settings-back-after-sign-out.yaml`; wiring test in `src/auth/sign-out.test.ts`
(red without the fix).
