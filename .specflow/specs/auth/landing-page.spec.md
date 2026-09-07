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

### Entities
None. The page is static content plus one piece of client state (the selected audience). It reads no
API and stores nothing.

### Rules
1. `/` renders the landing page when there is no session and the dashboard when there is one
   (`HomeRoute`); a returning user must never see the marketing page flash before their dashboard.
2. The page is **web-only** — the iOS equivalent is the App Store listing. The reason is recorded in
   the page header comment and in this spec so the "web and iOS ship together" rule is met.
3. Three audiences: `coaches` (default), `players`, `others`. A `tablist` at the top of the hero
   switches between them; switching re-renders the hero, benefits, how-it-works, results and final
   CTA for that audience without a navigation. `others` replaces the three middle sections with a
   single "ideas" section.
4. `?audience=<id>` seeds the initial audience. Both the i18n ids (`coaches`, `players`, `others`)
   and the Portuguese slugs (`treinadores`, `alunos`, `outros`) are accepted; anything else falls
   back to `coaches`. Switching tabs does not rewrite the URL.
5. CTA destinations (no backend exists for any of them):
   - coach primary ("Pedir demonstração") → `mailto:` the support address with a subject.
   - player primary ("Entrar") → `/auth`; player secondary ("Recebi um convite") → `/support`
     (invites are tokenised links; a lost one needs a human).
   - others primary ("Enviar ideia") → `mailto:` the admin address.
   - nav links and coach secondary → in-page anchors (`#vantagens`, `#como-funciona`, `#resultados`).
6. Every string goes through i18n (`landing` namespace, `pt` + `en`). Pre-auth pages render in the
   default locale (`pt`). Device screenshots are of the real product and stay Portuguese in both
   locales.
7. Device renders are frame PNGs with a transparent screen area under `/public/landing/`, with the
   app screenshot layered underneath; a missing image degrades to the bezel with a black screen,
   never a broken layout.
8. The header always shows "Entrar"; the demo button and section links collapse into a menu button
   below the `md` breakpoint. The footer links to `/support`, `/privacy`, `/terms`.
9. The page must never render the app shell (no sidebar, no app navigation).

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

#### Switching audience swaps the content
- **Given** the landing page on the default (coach) audience
- **When** the visitor selects the "Para alunos" tab
- **Then** the player hero heading ("Joga mais.") replaces the coach one and the tab is `aria-selected`
- **When** they select "Outros"
- **Then** the "Novidades a caminho." hero and the ideas section render, and the benefits / how /
  results sections are gone

#### A link can open the page on an audience
- **Given** no session
- **When** the visitor opens `/?audience=alunos` (or `/?audience=players`)
- **Then** the players tab is selected and the player hero renders

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

### Notes
- Second iteration, 2026-09-06: ported from the Lovable project "Padellevelup Playground"
  (`src/routes/index.tsx`), replacing the first hand-built page. Lovable's TanStack route, hard-coded
  Portuguese and custom utilities were translated to react-router, i18n and the app's tokens.
- Tests: `frontend/apps/web/e2e/landing/landing-page.spec.ts`.
