---
id: mobile.launch
status: draft
depends_on: [auth.login]
implements: ../../specs-business/mobile/the-app-opens-fast.business.md
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
   catching touches.
3. **Measured, not assumed.** Dev builds log `[launch] <milestone> t=<ms>` at fonts-ready,
   auth-restored, first-screen-ready, overlay-gone and dashboard-mounted, ms since the first app
   module evaluated; a change to the launch is proved with five cold launches before and after on
   the simulator (the numbers live in the PR body).
4. Persisting the query cache across launches is a follow-up (new packages); until then every
   launch fetches its first data.

### Acceptance Criteria

#### The overlay never ends before the fonts
- **Given** the first screen became ready 10 s ago and the fonts are still loading
- **When** the release rule is asked
- **Then** it says no; with the fonts ready it says yes once the grace has passed, not before

#### The overlay ends with the app, not with the clock (PAD-587)
- **Given** a signed-in session on the simulator and a cold launch
- **When** five launches are timed on the instrumentation-only commit and five on the fix
- **Then** `overlay-gone` on the fix comes within the grace of `first-screen-ready`, and the
  median `overlay-gone` is earlier than on the control, which sits at ≈ 3.3 s
- **And** `auth-restored` on the fix is no later than `fonts-ready` + the network round trip
