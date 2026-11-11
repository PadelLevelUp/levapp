---
id: mobile.launch
status: draft
depends_on: [auth.login]
serves: [P-MOBILE-6]
governed_by: []
---

# mobile.launch

### Intent
The iOS cold start reaches an interactive screen as early as its data allows: the session restore
runs in parallel with the font load, and the launch overlay ends at the earlier of its animation
and "the first screen is ready". PAD-587, from the PAD-571 speed study. iOS-only by nature: the
web app has no launch overlay (auth.login rule 8).

### Entities
- **READS:** the stored session token (SecureStore), `GET /auth/me`, the bundled font faces
- **WRITES:** nothing on the server

### Rules
1. **The restore starts first.** `startSessionRestore()` (keychain → `/auth/me`) is called once at
   module load in `app/_layout.tsx`, right after the API singleton exists and before the font gate
   renders anything; `AuthProvider` awaits that same promise. Fonts and the session check overlap.
2. **The overlay ends at the earlier of two things:** its own animation (3.3 s), or "first screen
   ready" plus `LAUNCH_RELEASE_GRACE_MS` (300 ms) — where "first screen ready" is the index route
   having resolved the session and issued its redirect (tabs, login, or a hold screen). **Never
   before the fonts are ready**, or the brand moment would hand over to unstyled text
   (`launch-overlay.ts`, unit-tested). On release the animation jumps to its final fade and stops
   catching touches. The rule is `overlayMayRelease` (two booleans, no clock); the grace is a timer
   in `app/_layout.tsx`, started once the rule says yes. A font error counts as "fonts ready" (the
   app falls back to system type). The final fade takes 300 ms (`LaunchAnimation.tsx`), so the
   overlay is gone about 600 ms after the first screen is ready.
3. **Measured, not assumed.** Dev builds log `[launch] <milestone> t=<ms>` at fonts-ready,
   auth-restored, first-screen-ready, overlay-gone and dashboard-mounted, ms since the first app
   module evaluated; a change to the launch is proved with five cold launches before and after on
   the simulator (the numbers live in the PR body).
4. Persisting the query cache across launches is a follow-up (new packages); until then every
   launch fetches its first data.

### Acceptance Criteria

#### MOBILE-LAUNCH-1: The overlay never ends before the fonts
- **Given** the first screen became ready 10 s ago and the fonts are still loading
- **When** the release rule is asked
- **Then** it says no; with the fonts ready as well it says yes. The grace is a timer outside this
  rule (rule 2), so the rule alone does not say when

#### MOBILE-LAUNCH-2: The overlay ends with the app, not with the clock (PAD-587)
- **Given** a signed-in session on the simulator and a cold launch
- **When** five launches are timed on the instrumentation-only commit and five on the fix
- **Then** `overlay-gone` on the fix comes within the grace plus the final fade (about 600 ms) of
  `first-screen-ready`, and the median `overlay-gone` is earlier than on the control, which sits at
  ≈ 3.3 s
- **And** `auth-restored` on the fix is no later than `fonts-ready` + the network round trip
- Code to follow: tighten `frontend/apps/mobile/src/lib/launch-overlay.test.ts`, which allows a
  grace of up to 500 ms, to assert the 300 ms of rule 2.

#### MOBILE-LAUNCH-3: The session is restored once per launch, however many callers ask (rule 1)
- **Given** a stored token and two callers that ask for the session at the same moment
- **When** both start the session restore
- **Then** the profile is requested once and both callers get the same result
- **And** after a reset, the next caller restores afresh
test: `frontend/apps/mobile/src/auth/session-restore.test.ts` › `two callers share one /auth/me` (+1 more)
