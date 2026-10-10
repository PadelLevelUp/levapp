---
id: auth.landing-page
status: implemented
depends_on: []
implements: ../../specs-business/auth/visitor-picks-an-audience-and-finds-the-way-in.business.md
governed_by: []
---

# auth.landing-page


### Intent
Give a visitor with no session a public page at `/` that speaks to the audience they belong to
(coach, player, or "other"), shows the real product on real devices, and hands them to the right
next step: a demo request, the login form, support for a lost invite, or an email for ideas.
Visits are measured with HubSpot only with the visitor's consent (PAD-469).

### Entities
No server entities; the page reads no API. Client state: the selected audience, and one stored
record — the visitor's cookie choice, in localStorage key `levapp.cookieConsent` as
`{choice: "accepted" | "declined", at: <ISO timestamp>}`.

### Rules
1. `/` renders the landing page when there is no session and the dashboard when there is one
   (`HomeRoute`); a returning user must never see the marketing page flash before their dashboard.
2. The page is **web-only** — the iOS equivalent is the App Store listing. The reason is recorded in
   the page header comment and in this spec so the "web and iOS ship together" rule is met. The
   HubSpot tracking, the cookie banner and the demo dialog (rules 10–13) are web-only for the same
   reason: the mobile app has no landing page and carries no tracking.
3. Three audiences: `coaches` (default), `players`, `others`. **The audience is chosen in the
   header (PAD-582):** a dropdown left of the section links — "Para treinadores ▾", "Para
   jogadores", "Para outros" — on every width (the short labels "Treinadores / Jogadores / Outros"
   below `md`), so the visitor sees whom "Vantagens · Como funciona · Resultados" speak to. It is the
   only place the audience is chosen: the tabs that used to sit at the top of the hero are gone
   (owner decision). Choosing re-renders the hero, benefits, how-it-works, results and final CTA for
   that audience without a navigation and without moving the scroll position. `others` replaces the
   three middle sections with a single "ideas" section. On this page the player audience is
   "jogadores" / "players" throughout; the app keeps "alunos" for its own students.
4. **The choice is in the URL (PAD-582).** Choosing writes `?para=<slug>` in place (`treinadores`,
   `jogadores`, `outros`; `history.replaceState`, no reload), so a link opens the page on an
   audience — campaigns share `/?para=jogadores`. Reading: `?para=` first, then the older
   `?audience=`, which keeps accepting the i18n ids (`coaches`, `players`, `others`) and the old
   Portuguese slugs (`treinadores`, `alunos`, `outros`) so links already out there still work;
   `jogadores` is accepted everywhere; anything else falls back to `coaches`.
5. CTA destinations (no backend of ours exists for any of them):
   - coach "Pedir demonstração" (header, mobile menu, hero, how-it-works, final CTA) → when the
     build carries a demo form ID (`VITE_HUBSPOT_DEMO_FORM_ID`), the demo dialog (rule 10);
     without one, `mailto:` the support address with a subject, as before.
   - player primary ("Entrar") → `/auth`; player secondary ("Recebi um convite") → `/support`
     (invites are tokenised links; a lost one needs a human).
   - others primary ("Enviar ideia") → `mailto:` the admin address.
   - nav links and coach secondary → in-page anchors (`#vantagens`, `#como-funciona`, `#resultados`).
   - Every link that leaves the page (Entrar, Recebi um convite, the footer links, the privacy
     links in the banner and the dialog) loads a new document, so a tracking script loaded here
     never runs on another page or inside the app. By construction: every exit is an `ExitLink`,
     and the landing files may not use react-router's `Link` directly.
6. Every string goes through i18n (`landing` namespace, `pt` + `en`). Pre-auth pages render in the
   default locale (`pt`). Device screenshots are of the real product and stay Portuguese in both
   locales.
7. Device renders are frame PNGs with a transparent screen area under `/public/landing/`, with the
   app screenshot layered underneath; a missing image degrades to the bezel with a black screen,
   never a broken layout.
8. The header always shows "Entrar"; the demo button and section links collapse into a menu button
   below the `md` breakpoint. The footer links to `/support`, `/privacy`, `/terms`.
9. The page must never render the app shell (no sidebar, no app navigation).
10. **Demo dialog.** HubSpot hosts fall into two sets, listed once in code
    (`frontend/apps/web/src/lib/hubspotConfig.ts`, which the tests import): the *tracking* hosts
    (the tracking script and everything it loads) and the *forms* hosts (the forms embed and its
    API). The demo dialog shows one line above the form saying it is provided by HubSpot, with a
    link to the Privacy Policy. The first time it opens it loads the HubSpot forms embed from the
    forms hosts (region `eu1`, portal `149443437`, the configured form ID) and renders the form
    inside the dialog; it does not wait for the cookie choice (the visitor asked for this
    service), and opening it does not load the tracking script. The source fields
    (`levapp_tipo_origem` = Inbound, `levapp_canal_origem` = Site) are hidden fields of the
    HubSpot form itself. If the embed fails to load, the dialog offers the `mailto:` instead.
11. **Cookie banner.** With no valid stored choice, the landing page shows a banner with
    "Aceitar" and "Recusar" — the same button style, size and weight, one click each. A choice
    older than 12 months counts as no choice, so the banner asks again (coordinator decision,
    2026-10-01: a conservative validity period, not a legal finding); the expired record is
    dropped and the HubSpot cookies it allowed are expired, as in rule 13 (a), so a lapsed
    visitor carries no `hubspotutk` into the demo form. Before "Aceitar", and at any
    time while the choice is `declined`, the page makes no request to any HubSpot host — except
    the forms hosts when the visitor opens the demo dialog (rule 10). Only the landing page shows
    the banner; the signed-in app never does (rule 1).
12. **Tracking.** With the choice `accepted`, the landing page injects the HubSpot tracking script
    (`js-eu1.hs-scripts.com/149443437.js`) once per document. HubSpot's own cookie banner stays
    off in the HubSpot portal, so the visitor sees one prompt.
13. **Revocation.** The footer link "Preferências de cookies" reopens the banner. Choosing
    "Recusar" after "Aceitar" does, in this order: (a) expire the HubSpot cookies the page can
    reach (`__hstc`, `__hssc`, `__hssrc`, `hubspotutk`, `__hs_*`, on the host and each parent
    domain); (b) store `declined`; (c) reload the page, so the running script stops. Cookies
    HubSpot keeps on its own domains are outside the page's reach.

### Acceptance Criteria

#### A visitor gets the landing page
- **Given** no session
- **When** they open `/`
- **Then** the coach hero heading ("Enche as aulas.") is visible, the URL stays `/`, and no app
  navigation link is rendered

#### A signed-in user gets the dashboard
- **Given** a signed-in coach
- **When** they open `/`
- **Then** the dashboard renders and the landing heading is not on the page

#### Switching audience swaps the content (PAD-582)
- **Given** the landing page on the default (coach) audience, whose header dropdown reads "Para
  treinadores"
- **When** the visitor opens the dropdown and picks "Para jogadores"
- **Then** the player hero heading ("Joga mais.") replaces the coach one, the dropdown reads "Para
  jogadores", the URL is `/?para=jogadores`, and no navigation or reload happened
- **When** they pick "Para outros"
- **Then** the "Novidades a caminho." hero and the ideas section render, the benefits / how /
  results sections are gone, and the URL is `/?para=outros`
- **And** there is no audience `tablist` anywhere on the page

#### A link can open the page on an audience (PAD-582)
- **Given** no session
- **When** the visitor opens `/?para=jogadores`, `/?audience=alunos` or `/?audience=players`
- **Then** the dropdown reads "Para jogadores" and the player hero renders
- **When** they open `/?audience=nope`
- **Then** the coach page renders

#### The final CTA rotates audiences
- **Given** the coach audience
- **When** the visitor presses "Sou aluno" in the final CTA
- **Then** the players audience renders; pressing "Sou treinador" returns to coaches

#### Entrar reaches the login form
- **Given** the landing page
- **When** the visitor presses the header "Entrar"
- **Then** the login form at `/auth` is shown

#### Footer reaches the legal pages
- **Given** the landing page
- **When** the visitor presses "Privacidade" / "Termos"
- **Then** `/privacy` / `/terms` open

#### Nothing reaches HubSpot before consent
- **Given** a visitor with no stored cookie choice, every HubSpot host stubbed
- **When** they open `/` and scroll the whole page
- **Then** the cookie banner is visible, no request leaves the page's origin except the web fonts
  (every host is watched, so a HubSpot host missing from the list still fails), and no HubSpot
  cookie exists

#### Accepting and declining weigh the same
- **Given** the cookie banner
- **Then** "Aceitar" and "Recusar" have the same height and font weight

#### Declining keeps HubSpot out across reloads
- **Given** the cookie banner
- **When** the visitor presses "Recusar" and reloads
- **Then** the banner is gone, no request has reached a HubSpot host, and no HubSpot cookie exists

#### Accepting loads the tracking script once per document
- **Given** the cookie banner
- **When** the visitor presses "Aceitar"
- **Then** `js-eu1.hs-scripts.com/149443437.js` is requested once and runs once; after a reload the
  banner stays hidden and the script is requested once more for the new document

#### Revoking removes the cookies and stops tracking
- **Given** a visitor who accepted, with `hubspotutk` and `__hstc` set
- **When** they press "Preferências de cookies", then "Recusar"
- **Then** the page reloads, the HubSpot cookies are gone, the script does not run, and no further
  HubSpot request is made

#### Every exit is a new document
- **Given** the landing page, on each audience, and the open demo dialog
- **When** the visitor follows any same-origin link on it (found from the page, not from a list)
- **Then** the destination is a new document

#### The signed-in app never shows the banner
- **Given** a signed-in coach
- **When** they open `/`, `/calendar`, `/settings`
- **Then** no cookie banner renders and nothing reaches HubSpot

#### The dialog falls back to email when the embed cannot load
- **Given** the HubSpot hosts unreachable
- **When** the visitor opens the demo dialog
- **Then** it offers the `mailto:` link

#### Leaving the page drops the tracker
- **Given** a visitor who accepted and has the tracking script running
- **When** they press "Entrar"
- **Then** `/auth` is a new document with no HubSpot script element, no running tracker and no
  HubSpot request

#### Consent expires after 12 months
- **Given** the clock at 2026-10-01, a stored `accepted` choice dated 2025-09-30, and the
  `hubspotutk` / `__hstc` cookies it allowed
- **When** the visitor opens `/`
- **Then** the banner shows, the cookies are gone, and nothing leaves the page's origin
- **Given** a stored `accepted` choice dated 2025-10-15 instead
- **Then** no banner shows and the tracking script loads

#### The demo dialog embeds HubSpot's form without the tracker
- **Given** a build with a demo form ID and no stored cookie choice
- **When** the visitor presses "Pedir demonstração"
- **Then** the dialog shows the HubSpot notice linking `/privacy`, the form renders, the embed was
  created with region `eu1`, portal `149443437` and the configured ID, every HubSpot request went to
  a forms host, and the tracking script was not requested
- **When** they close and reopen the dialog
- **Then** the form renders again and the embed script was loaded only once

#### Without a form ID the demo stays an email
- **Given** a build with no demo form ID
- **When** the landing page renders
- **Then** "Pedir demonstração" is a `mailto:` link to the support address

### Notes
- Second iteration, 2026-09-06: ported from the Lovable project "Padellevelup Playground"
  (`src/routes/index.tsx`), replacing the first hand-built page. Lovable's TanStack route, hard-coded
  Portuguese and custom utilities were translated to react-router, i18n and the app's tokens.
- Tests: `frontend/apps/web/e2e/landing/landing-page.spec.ts`,
  `frontend/apps/web/e2e/landing/hubspot-consent.spec.ts` (PAD-469, every HubSpot host stubbed),
  `frontend/apps/web/src/lib/cookieConsent.test.ts`,
  `frontend/apps/web/src/components/landing/landing-guards.test.ts` (static: no direct `Link` in
  the landing files; no HubSpot host in `index.html`),
  `frontend/apps/web/src/pages/LandingPage.demo.test.tsx`.
- PAD-469 (2026-10-01): the consent design is a first-party banner gating the HubSpot script,
  chosen by the coordinator over HubSpot's own banner, because HubSpot's banner is delivered *by*
  the tracking script, so a visitor's browser would contact HubSpot before consenting. Measured
  the same day (`frontend/apps/web/e2e/scripts/measure-hubspot-embed.ts`): the real forms embed
  (v2, eu1), before any submit, contacts only `js-eu1.hsforms.net` and `forms-eu1.hsforms.com`,
  sets no first-party cookie, and the CDN sets Cloudflare's `__cf_bm` on `.hsforms.net` (bot
  management, ~30 min). The measurement used a placeholder form ID; it must be re-run against the
  real ID before prod promotion.
- Known blind spot, guarded separately: resource hints (`preconnect`, `dns-prefetch`) to a HubSpot
  host never show up as requests, so the E2E zero-request guard cannot see them; the static
  `index.html` check in `landing-guards.test.ts` covers them.
- Rule 13's order is tested by outcome: after Recusar the reloaded document reads `declined` and
  runs no tracker; a reload before the write would come back `accepted` and load it again.
