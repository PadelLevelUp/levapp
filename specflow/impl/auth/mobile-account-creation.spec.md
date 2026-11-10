---
id: auth.mobile-account-creation
status: implemented
depends_on:
  - auth.mobile-universal-links
  - auth.activate
  - players.invite-completion
  - clubs.coach-invitation
serves: [P-AUTH-4]
governed_by: []
---

# auth.mobile-account-creation


### Intent
Web has three account-creation surfaces; iOS had none. `apps/mobile/app/login.tsx` could only sign in
an account that already existed, so a coach who invited a student and then said "download the app"
sent them into a dead end: the student had to find the web app first, finish there, and come back.

`auth.mobile-universal-links` made the link *arrive* in the app. This spec is the other half — the
three native screens the arriving link lands on, so account creation finishes inside the app.

It also closes a smaller pre-auth gap: web's sign-in page links the Privacy Policy and Terms of
Service, mobile linked them only from Settings — that is, from behind the sign-in a person who has no
account yet cannot complete.

### Screens
| Route (mobile) | Web twin | API (`packages/api`) |
| --- | --- | --- |
| `app/invite/player/[token].tsx` | `apps/web/src/pages/PlayerInvitePage.tsx` | `playerInvitationsApi` |
| `app/invite/coach/[token].tsx` | `apps/web/src/pages/CoachInvitePage.tsx` | `invitationsApi` |
| `app/register/[userId].tsx` | `apps/web/src/pages/RegisterPage.tsx` | `registerApi` |

### Rules
1. The three routes are unauthenticated. They sit outside the tab navigator, and all four endpoints
   they call are public, so a cold launch straight onto one of them works with no session.
2. Each route's file path is exactly the web path claimed in the association file
   (`/invite/player/*`, `/invite/coach/*`, `/register/*`). Expo Router matches the origin-stripped
   path against the file tree, so the route files are the linking config; changing one without
   changing the AASA silently breaks the tap.
3. A route re-validates its raw param through `parseUniversalLink` rather than trusting it. A
   missing, blank or multi-segment token renders the invalid state and fires no request.
4. Form rules mirror web exactly: name ≥ 2 characters (coach invite, register), username ≥ 3,
   password ≥ 6, repeat password must match, and register additionally requires a valid email while
   phone stays optional.
5. Validation failures are surfaced per field, from i18n key suffixes rather than English literals
   (`auth.playerInvite.usernameMin`, `auth.coachInvite.usernameMin`, `auth.register.usernameMin`).
6. Accept failures map by HTTP status: 409 → "username taken", shown under the form and recoverable
   in place; 404 or 410 → the link is dead, so the screen swaps to its invalid state; anything else,
   including a request that never reached the server, → the generic error.
7. Both invite screens end signed in. The accept endpoints return an access token, so the screen
   calls `login()` and replaces the route with the dashboard — the person never retypes what they
   just chose.
8. Register (activation) returns no access token, so it ends on the sign-in screen with a success
   toast, matching web's redirect to `/auth`.
9. Register distinguishes three non-form states: still loading, `isActive` (someone already activated
   this account — a neutral notice, not an error), and a link that did not resolve. Web reports the
   last of these with a destructive toast and an immediate redirect; on mobile that flashes past a
   user who has only just been dropped into the app by a link, so it renders as a state with a
   "go to login" action instead.
10. Privacy Policy and Terms are reachable from the sign-in screen and from the register screen,
    opening `PRIVACY_POLICY_URL` / `TERMS_URL` in the system browser via `Linking.openURL` — the same
    mechanism Settings already uses. `expo-web-browser` is deliberately not added: an in-app browser
    sheet for two links is not worth a native module and a prebuild.
11. The `auth` namespace is statically imported by `apps/mobile/src/lib/i18n.ts` in both languages.
    Without it every string on these screens renders as its raw key path on a device and nothing else
    in the repo fails.

### Acceptance Criteria

#### AUTH-MOBILE-ACCOUNT-CREATION-1: An invited player completes their account without leaving the app
- **Given** a pending player invitation with token `abc123`
- **When** the app opens `/invite/player/abc123` and the player submits a username and a password
- **Then** `POST /api/app/player-invitations/abc123/accept` is called with those values
- **And** the returned access token is persisted, and the player lands on the dashboard signed in

#### AUTH-MOBILE-ACCOUNT-CREATION-2: An invited coach joins the club from the app
- **Given** a pending coach invitation for club "Padel Norte"
- **When** the app opens `/invite/coach/<token>` and the coach submits name, username and password
- **Then** the screen shows the club name before submission
- **And** on success the coach is signed in and lands on the dashboard

#### AUTH-MOBILE-ACCOUNT-CREATION-3: A coach-created player activates their account from the app
- **Given** an inactive user whose username is a generated placeholder
- **When** the app opens `/register/<userId>`
- **Then** the name/email/phone the coach entered are prefilled and the username field is empty
- **And** on submit the account is activated and the person is taken to the sign-in screen

#### AUTH-MOBILE-ACCOUNT-CREATION-4: A dead link never fires a tokenless request
- **Given** a route param that is missing, blank, or carries extra path segments
- **When** the route renders
- **Then** the invalid state is shown and no invitation lookup is attempted

#### AUTH-MOBILE-ACCOUNT-CREATION-5: A taken username is recoverable, an expired link is not
- **Given** an accept call that fails
- **When** the status is 409
- **Then** the error appears under the form and the person can pick another username
- **And when** the status is 404 or 410, the screen switches to its invalid state instead

#### AUTH-MOBILE-ACCOUNT-CREATION-6: Legal pages are reachable before signing in
- **Given** the mobile sign-in screen
- **When** the person taps "Privacy Policy" or "Terms of Service"
- **Then** the hosted page opens in the system browser

#### AUTH-MOBILE-ACCOUNT-CREATION-7: The three completion forms check each field before sending, and put a server refusal on its own field (rules 4, 5)
- **Given** the player-invite, coach-invite and activation forms in the app
- **When** a form is submitted with a name of one character, a username of two, a password of five, a repeat that differs, or an email that is not an address where one is asked
- **Then** each field shows its own error, named by a translation key, and nothing is sent
- **And** each form asks for a birth date typed day/month/year and refuses an empty, unreal or under-18 date; asks for a country, Portugal by default; and requires the Terms box
- **When** the form is valid
- **Then** the request carries the chosen country, the birth date as `YYYY-MM-DD`, `termsAccepted: true`, and on the coach invite the email trimmed
- **And** a server refusal that names `country`, `terms` or `email` is shown on that field: a taken email on the email field, not as a taken username
test: `frontend/apps/mobile/src/features/auth/account-setup.test.ts` › `accepts a valid form` (+33 more)

### Notes
Everything a screen decides before rendering — param → token, form → error codes, HTTP status →
outcome — lives in `apps/mobile/src/features/auth/account-setup.ts`, a pure module, because mobile's
vitest environment stubs out `react-native` and cannot render a screen. `account-setup.test.ts` pins
it, plus the i18n keys every screen can reach in both languages.

The PAD-184 hand-off placeholder (`UniversalLinkHandoff.tsx`) and its `auth.universalLink.*` strings
are removed by this change — the screens it stood in for now exist.

Not verifiable without hardware: a real universal-link tap needs a physical device, a signed build
carrying the associated-domains entitlement, and the association file actually served. See
`auth.mobile-universal-links`.

### Open questions

- **Rules 4, 6 and 7 describe the forms before the later tickets changed them.**
  - Rule 4: "name ≥ 2 characters …, username ≥ 3, password ≥ 6, repeat password must match, and
    register additionally requires a valid email". Rule 6: "409 → "username taken", shown under
    the form". Rule 7: "Both invite screens end signed in … replaces the route with the dashboard".
  - Other specs: `auth.activate` rules 13, 13a and 13b, `players.invite-completion` and
    `clubs.coach-invitation` add the birth date, the country, the Terms and the coach's email to
    these forms; `auth.activate` rule 11a answers a taken email with 409 on `email`.
  - Code today: `features/auth/account-setup.ts` requires all of those on the three forms; a 409
    whose `field` is `email` is shown on the email field; and `coachInviteLanding` sends a coach
    whose email is not verified to `/verify-email` before the dashboard.
    AUTH-MOBILE-ACCOUNT-CREATION-7 states the forms as they are.
  - Recommendation: amend the three rules to the code; each change was a decided ticket
    (PAD-457, PAD-604, PAD-637, PAD-761, PAD-477).
  - Proposed rule 4 addition: "…Every form also asks for an adult birth date, a country and the
    Terms; the coach invite asks for an email." Proposed rule 6: "409 → the field the answer
    names is taken (the username, or the email), shown on that field and recoverable in place…".
    Proposed rule 7: "Both invite screens end signed in, on the dashboard, or on the email-code
    screen first when the new coach's email is not verified."
