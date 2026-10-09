---
id: mobile.install-suggestion
status: draft
depends_on: [auth.login]
implements: ../../specs-business/mobile/student-on-a-phone-finds-the-ios-app.business.md
governed_by: []
---

# mobile.install-suggestion

### Intent
On an iPhone, the signed-in web app suggests the iOS app to a student once, dismissibly, with a
link to the App Store listing; Safari also gets Apple's Smart App Banner. PAD-573.

**Web-only by nature:** the suggestion is a prompt to leave the web app for the iOS app, so it has
no iOS counterpart (the hard rule's "a surface nobody would use on a phone" exception, inverted:
a surface that only exists off the phone app).

### Entities
- **READS:** User (`roles`, from `/api/auth/me`), the browser's user agent, the device's
  `localStorage`
- **WRITES:** nothing on the server

### Rules
1. **Audience.** The card renders only when the signed-in user is a student (no `coach` role; an
   account with no `roles` field at all counts as a student)
   AND the user agent is iPhone-class: it contains `iPhone` or `iPod` (iPadOS Safari presents a
   Macintosh user agent and is a tablet; it sees nothing). Coaches, desktop browsers and Android
   see nothing — Android because there is no store listing yet (owner decision, PAD-573).
2. **Store link.** The App Store id and URL live in one place, `@levelup/config`
   (`APP_STORE_ID = "6794271800"`, `APP_STORE_URL`), the id read from App Store Connect
   (TestFlight upload notes); the repo had no store configuration before this. The card's link
   opens the URL in a new tab (`rel="noopener"`).
3. **Dismissal.** "Agora não" stores the dismissal instant under `levapp.installSuggestion.
   dismissedAt` in `localStorage`; the card stays hidden for **30 days** on that device, for every
   account that signs in on it. A missing, unreadable or malformed value counts as not dismissed;
   storage that throws (private mode) is treated as not dismissed and the dismissal is kept for
   the page's lifetime only. The key carries no account id, which is what makes it per device: the
   unit test proves a fresh mount after a dismissal stays hidden whoever is signed in.
4. **Never a hold.** The card sits above the page content inside the app shell, pushes the page
   down, and is the first thing after the header; it never overlays, never traps focus, never
   delays rendering. It is absent while `/api/auth/me` has not answered.
5. **Smart App Banner.** `index.html` carries `<meta name="apple-itunes-app"
   content="app-id=6794271800">`, so Safari on iOS shows Apple's banner on every page (the
   zero-code path; it opens the app directly when installed). The custom card covers the other
   iOS browsers and the signed-in context.
6. **Copy** from the `installApp` namespace in both languages (`title`, `body`, `open`,
   `dismiss`).
7. **Measurement:** none (business rule 6). The code has no hook for it; add one with analytics.
8. **Pure logic lives in `@levelup/config`** (`install-suggestion.ts`): the user-agent test, the
   audience test, and the dismissal window with the storage injected, so it is unit-tested
   without a browser and reusable if a future shell needs it.

### Acceptance Criteria

#### A student on an iPhone sees the suggestion
- **Given** a signed-in student and a user agent of
  `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) … Safari/604.1`
- **When** any app page renders
- **Then** `install-app-banner` is visible above the page content, its `install-app-open` link
  points at `https://apps.apple.com/app/id6794271800`, and the page behind it is usable

#### Dismissing hides it for 30 days on the device
- **Given** the student above dismissed the card ("Agora não")
- **When** they reload, navigate, sign out and sign in again on the same browser 29 days later
- **Then** the card is absent
- **And** 31 days after the dismissal it is back

#### A coach, a desktop browser and an Android phone see nothing
- **Given** a signed-in coach on the iPhone user agent, or a student on `Desktop Chrome`, or a
  student on `Mozilla/5.0 (Linux; Android 14; Pixel 8) … Mobile Safari/537.36`
- **When** any app page renders
- **Then** `install-app-banner` is absent

#### Safari gets the Smart App Banner
- **Given** the served `index.html`
- **Then** it contains `<meta name="apple-itunes-app" content="app-id=6794271800">`

#### The copy is bilingual
- **Given** the student above with the account language `pt`, then `en`
- **Then** the card reads "A LevApp também está na App Store" / "Ir para a App Store" /
  "Agora não", then "LevApp is on the App Store" / "Open the App Store" / "Not now"
