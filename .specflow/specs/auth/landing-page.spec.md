---
id: auth.landing-page
status: implemented
depends_on: []
implements: ../../specs-business/auth/visitor-picks-an-audience-and-finds-the-way-in.business.md
governed_by: []
---

# auth.landing-page


### Intent
Give a visitor with no session the public LevApp site at `/` (PAD-656: the FINAL Claude design,
owner decisions 2026-10-21): one page per audience (coach, player, "other") that shows what the
product does with the real app's screenshots and HTML mock-ups of it, and hands them to the right
next step: a demo request or contact, the login or sign-up form, the coach's invitation link, or an
email for ideas. Visits are measured with HubSpot only with the visitor's consent (PAD-469).

### Entities
No server entities; the pages read no API. Client state: the selected audience (`?para=`), and one
stored record — the visitor's cookie choice, in localStorage key `levapp.cookieConsent` as
`{choice: "accepted" | "declined", at: <ISO timestamp>}`.

### Rules
1. `/` renders the site when there is no session and the dashboard when there is one
   (`HomeRoute`); a returning user must never see the marketing page flash before their dashboard.
   `/contacto` (rule 17) renders the site's contact page.
2. **Web-only by nature (R-024 exception).** The site is the public website: the iOS app has no
   marketing pages, and its pre-install equivalent is the App Store listing. The HubSpot tracking,
   the cookie banner and the contact form (rules 10–13, 17–19) are web-only for the same reason: the
   mobile app has no site and carries no tracking. The reason is recorded here and in the PR.
3. **Three audiences, chosen in the header (PAD-582, PAD-656):** a pill left of the section links —
   "Para treinadores ▾" / "Para alunos" / "Outros" (✓ on the current one) — on every width, so the
   visitor sees whom "Vantagens · Como funciona · Resultados" speak to. Choosing swaps the page body
   for that audience without a navigation and without moving the scroll position. There is no
   "Preço" link or section (owner, 2026-10-21) and no FAQ. On "Outros" the header shows no section
   links. Off `/` (the contact page) the section links go to `/?para=<slug>#<section>`.
4. **The choice is in the URL (PAD-582).** Choosing writes `?para=<slug>` in place (`treinadores`,
   `jogadores`, `outros`; replace, no reload), so a link opens the site on an audience — campaigns
   share `/?para=jogadores`. Reading: `?para=` first, then the older `?audience=`, which keeps
   accepting the i18n ids (`coaches`, `players`, `others`) and the old Portuguese slugs
   (`treinadores`, `alunos`, `outros`) so links already out there still work; anything else falls
   back to `coaches`. The visible label for players is "Para alunos"; the URL slug stays `jogadores`.
5. **The pages (the FINAL design's sections, in order; copy verbatim in `site.*`, pt-PT with "tu"):**
   - **Para treinadores:** hero (badge, "Mais turmas cheias. / Menos horas no WhatsApp.", Pedir
     demonstração, Ver como funciona, four ✓ points, store buttons); **Vantagens** (three cards, the
     messages composite, feature rows Avisos / Novos alunos / Reservas, the week calendar mock-up);
     **Como funciona** (three steps, Falar connosco, the import row, the two-phone demo); **Resultados**
     (pilot figures with the pilot note, a quote, the tactical board); a closing call (Pedir
     demonstração, "Sou aluno").
   - **Para alunos:** hero ("Joga mais. / Espera menos.", Criar conta grátis, Recebi um convite, four
     ✓ points, store buttons); **O que ganhas** (four cards, the coach's chat, the Disponibilidade
     row); **Como funciona** (three steps, Falar connosco); **Resultados**; "Grátis para alunos"
     (store buttons; no prices); its own closing call (Criar conta grátis, "Sou treinador") — never the
     coaches' one.
   - **Outros:** the "em construção" hero, the ideas list, "Tens uma ideia?"; no closing call.
6. **Destinations.** "Pedir demonstração" / "Quero ser treinador piloto" open the contact dialog with
   `pedido=demonstracao` (rule 18; without a form ID a `mailto:` CONTACT_EMAIL). "Falar connosco"
   opens it with no `pedido`. "Entrar" → `/auth`; "Criar conta grátis" → `/signup`. "Recebi um
   convite" opens, in place, the explanation of the coach's link or QR code with "Cria a conta na
   mesma" → `/signup` (PAD-656: the design and the ticket; it replaces the old `/support` exit).
   "Enviar ideia" → `mailto:` CONTACT_EMAIL. "Ver como funciona" and the section links → in-page
   anchors (`#vantagens`, `#como-funciona`, `#resultados`). "Sou aluno" / "Sou treinador" / "Ver
   para treinadores" switch the audience. Every link that leaves the site (Entrar, Criar conta, the
   legal links, the privacy links in the banner and the dialog) loads a new document, so a tracking
   script loaded here never runs on another page or inside the app: every exit is an `ExitLink`, and
   the site's page files may not use react-router's `Link` (the footer's in-site link to `/contacto`
   is the one exception, in the layout).
7. **Media.** Raster images are the real app's screenshots inside device frames
   (`/public/landing/`; a missing image degrades to the bezel with a black screen, never a broken
   layout) — no photos. The design's product mock-ups (calendar, chats, two-phone demo, tactical
   board, availability block, import panel) are drawn in HTML with the design's fictitious names
   (Bernardo T., Ana, ACADEMIA NORTE…), never real users, each one image to assistive technology.
   Every string goes through i18n (`site` namespace, `pt` source + `en`); pre-auth pages render in
   `pt`. Screenshots stay Portuguese in both locales.
8. **Responsive (one page, the design's breakpoints).** Desktop layout from 993 px; 993–1100 px
   tighter header links; ≤ 992 px the section links and both header buttons move into the ☰ menu
   (it closes after a link); ≤ 640 px sections stack, no wordmark, the demo shows only the active
   phone, the calendar hides its side column and scrolls inside its own box; ≤ 380 px a compact
   audience pill. No width from 320 to 1920 px may scroll the page sideways or cut content: wide
   content sits in an `overflow-x: auto` box. The site is light-only (it forces the light theme
   while mounted). Touch targets ≥ 44 px.
9. **Motion.** The two-phone demo starts when its section enters the screen: five steps of 5.8 s
   (falta → vaga → convite → aceitação → confirmação), pause / play / replay, a step button jumps to
   it and stops autoplay; it stops at the last step. The tactical board loops. With
   `prefers-reduced-motion` nothing animates and the demo does not autoplay. The page never renders
   the app shell (no sidebar, no app navigation).
10. **Contact dialog (PAD-469; PAD-617; PAD-650).** HubSpot hosts fall into two sets, listed once in
    code (`frontend/apps/web/src/lib/hubspotConfig.ts`, which the tests import): the *tracking* hosts
    (the tracking script and everything it loads) and the *forms* hosts. One form serves every
    commercial contact button — every "Pedir demonstração" and "Falar connosco"; "Enviar ideia" (the
    "others" audience) stays an email and the footer "Contacto" stays `/support`. It opens a dialog
    headed "Vamos falar!" with LevApp's own form (the design system's inputs, checkboxes and radio
    groups; one primary button "Enviar pedido"), in this order: Nome, Apelido, Telemóvel, Email, "Em
    que clube dás aulas?" (all text, required); "Como geres hoje as presenças, faltas e novos
    convites?" (multiple choice, at least one); "Já envias lembretes para confirmar a presença dos
    teus alunos?" and "Quanto tempo gastas por semana a confirmar presenças, validar e enviar novos
    convites?" (single choice, required); the consent intro and the required box "Aceito que a
    LevApp guarde e trate os meus dados pessoais para responder a este pedido."; the optional
    marketing box "Opcional: quero receber em primeira mão promoções e novas funcionalidades da
    LevApp. Podes cancelar a qualquer momento." (shown only when the build carries a marketing
    subscription id); and "Sabe como tratamos os teus dados na nossa Política de Privacidade."
    linking `/privacy`. Options are shown by label and sent by internal value, exactly the CRM's:
    `levapp_gestao_atual` ∈ {`ferramentas_classicas`, `clube_outro_treinador`, `ninguem_trata`,
    `outro`} joined with `;`; `levapp_lembretes_presenca` ∈ {`diariamente`, `semanalmente`,
    `nao_envia`}; `levapp_tempo_gestao` ∈ {`menos_1h`, `1_3h`, `mais_3h`}. A Portuguese mobile
    number (9 digits starting with 9, with or without +351/00351, spaces allowed) is normalised to
    `+351 9XX XXX XXX`; another country's number (a leading `+` other than `+351`, 8–15 digits) is
    sent as typed; anything else, a Portuguese landline included, is refused.
    The browser posts it to `POST /api/public/demo-request` and **never reaches a HubSpot host**
    from the dialog, so it neither waits for the cookie choice nor loads the tracking script; the
    visitor's `hubspotutk` cookie goes along only when the stored cookie choice is `accepted`
    (rule 12), never on the cookie's presence alone.
    The server validates the fields the same way (400 `{field, code}` otherwise), then forwards
    them to HubSpot's public Forms API v3 (`api-eu1.hsforms.com/submissions/v3/integration/submit/
    149443437/<form GUID>`, the EU portal's host, no token) as `firstname`, `lastname`, `phone`,
    `email`, `clube_atual` (the field the live form requires — not `company`, PAD-650 probe
    2026-10-14), the three qualification fields, and the hidden `levapp_tipo_origem` = inbound,
    `levapp_canal_origem` = site and `levapp_pedido_site` = `demonstracao` (sent only from a demo
    button; "Falar connosco" sends none), plus the visitor's IP, page (an http(s) URL; title ≤ 100
    chars) and `hutk` (only a 32-hex value). Consent goes as `legalConsentOptions.consent` with
    `consentToProcess: true` and the box's text verbatim; when `HUBSPOT_MARKETING_SUBSCRIPTION_ID`
    is set, `communications` carries one entry with that id, the marketing box's text verbatim and
    `value` true or false as ticked; unset, no `communications` entry is sent. Limits: text fields
    ≤ 200 chars, body ≤ 16 KB (else 413); the web form holds the same limits, announces its errors
    in Portuguese (`role="alert"`) and moves focus to the first one.
    **Spam:** a hidden, inert honeypot field and a minimum of 3 s to fill are answered as success and
    dropped *before* any validation, so a bot learns nothing about the form (they deter naive bots
    only; the fill time is the client's word); the route is limited per IP
    (`AUTH_RATE_LIMIT_DEMO`, 5 per hour); HubSpot filters the rest. The form GUID and the marketing
    subscription id are deployment config (GitHub repo variables `HUBSPOT_DEMO_FORM_ID` / `_STAGING`
    and `HUBSPOT_MARKETING_SUBSCRIPTION_ID` / `_STAGING`, passed to the web build and to the API
    container; the subscription id is one variable read by both, so the box and the
    `communications` entry come and go together). Without the GUID the buttons stay a `mailto:`; with it, a 503, a 502 (HubSpot
    refused or unreachable, logged with the status only, never the visitor's data) or a network
    failure shows a retry and the `mailto:` in the dialog. On success the dialog says "Obrigado!
    Vamos falar contigo em breve." (no promised delay).
11. **Cookie banner.** With no valid stored choice, the landing page shows a banner with
    "Aceitar" and "Recusar" — the same button style, size and weight, one click each. A choice
    older than 12 months counts as no choice, so the banner asks again (coordinator decision,
    2026-10-01: a conservative validity period, not a legal finding); the expired record is
    dropped and the HubSpot cookies it allowed are expired, as in rule 13 (a), so a lapsed
    visitor carries no `hubspotutk` into the demo form. Before "Aceitar", and at any
    time while the choice is `declined`, the page makes no request to any HubSpot host — the
    contact dialog included (rule 10). Only the landing page shows
    the banner; the signed-in app never does (rule 1).
12. **Tracking.** With the choice `accepted`, the landing page injects the HubSpot tracking script
    (`js-eu1.hs-scripts.com/149443437.js`) once per document. HubSpot's own cookie banner stays
    off in the HubSpot portal, so the visitor sees one prompt.
13. **Revocation.** The footer link "Preferências de cookies" reopens the banner. Choosing
    "Recusar" after "Aceitar" does, in this order: (a) expire the HubSpot cookies the page can
    reach (`__hstc`, `__hssc`, `__hssrc`, `hubspotutk`, `__hs_*`, on the host and each parent
    domain); (b) store `declined`; (c) reload the page, so the running script stops. Cookies
    HubSpot keeps on its own domains are outside the page's reach.

14. **One contact address (PAD-599, B-562).** Everywhere the site offers an email — the landing
    page's demo and ideas links and its footer, `/support`, the static `public/support.html` the App
    Store listing points at, and the landing copy that names it — shows `admin@levapp.app`, read from
    `CONTACT_EMAIL` in `@levelup/config`. No other address is typed in the site's sources.
15. **App Store buttons (PAD-619).** "Descarrega na App Store" opens LevApp's App Store page,
    `APP_STORE_URL` from `@levelup/config` (the link the install suggestion uses, PAD-573), in a new
    tab (`target="_blank"`, `rel="noopener noreferrer"`). Its accessible name is the visible text plus
    a screen-reader-only "(abre num separador novo)", so it contains the visible label (WCAG 2.5.3). It
    sits under the hero's ✓ points for coaches and players, and in the players' "Grátis para alunos"
    section (PAD-656); the "others" audience has none. A drawn button, not Apple's badge artwork.
    Beside it "Em breve na Google Play" is a plain, dashed label, not a link, until the Play listing
    (PAD-355).
16. **The link preview names levapp.app (PAD-595).** `index.html`'s Open Graph and Twitter tags
    (`og:url`, `og:image`, `twitter:image`) point at `https://levapp.app/`, so a link to the site
    shared on WhatsApp or elsewhere previews the canonical domain; the old domain appears nowhere
    in the page.

17. **Contact page (PAD-656).** `/contacto` renders the site layout (header, footer, consent slot)
    with the contact form: the same fields, order, validation and test ids (`demo-*`) as the dialog,
    inside a `contact-page` wrapper with an h1. It sends no `pedido`; its `pageUri` is the `/contacto`
    URL (so HubSpot tells a contact from a demo request). Success replaces the form in place
    (`demo-sent`) with a "Voltar ao início" exit to `/`. A network failure shows `demo-failed` with the
    `mailto:` fallback and keeps the typed values.
18. **One form (PAD-656).** The dialog and the page share one form component (`DemoRequestForm`); the
    dialog is only the shell: it opens clean every time, closes on X, Esc and a click outside, and
    keeps its `demo-dialog` id. The design's extra demo fields (number of students, hours a week,
    city) are not used: the owner kept PAD-650's form (2026-10-21).
19. **Consent on every site page.** The site layout mounts the cookie banner and the HubSpot
    tracking exactly as rules 11–13 say, through one hook (`useSiteConsent`); the footer's
    "Preferências de cookies" reopens it on every site page, `/contacto` included.
20. **Contact page widths.** `/contacto` fits every width of rule 8; its fields are full width at
    ≤ 640 px.

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
- **When** the visitor presses "Sou aluno" in the closing call
- **Then** the players audience renders (`?para=jogadores`); its own closing call's "Sou treinador"
  returns to coaches

#### Each audience shows its own sections, and none shows a price (rules 3, 5, PAD-656)
- **Given** `/`, `/?para=jogadores` and `/?para=outros` at 1280 px
- **Then** coaches show hero, Vantagens (with the calendar), Como funciona (with the two-phone demo),
  Resultados (with the tactical board) and the closing call; players show hero, O que ganhas (with
  the Disponibilidade row), Como funciona, Resultados, "Grátis para alunos" and their closing call;
  Outros show the em-construção hero, the ideas and "Tens uma ideia?"
- **And** no page has a `#preco` section or a "Preço" link, and the header has 3 section links for
  coaches and players and none for Outros

#### "Recebi um convite" explains the coach's link in place (rule 6, PAD-656)
- **Given** the players audience
- **When** the visitor presses "Recebi um convite"
- **Then** it expands (`aria-expanded="true"`) the explanation of the coach's link, whose "Cria a conta
  na mesma" leads to `/signup` as a new document; nothing navigates until a link is pressed

#### No width scrolls the page sideways (rule 8, PAD-656)
- **Given** each audience page at 320, 360, 390, 414, 768, 992, 1024, 1100, 1280, 1440 and 1920 px
- **Then** every rendered element of the site lies inside the viewport, except inside an
  `overflow-x: auto` box (the calendar); at ≤ 992 px the ☰ menu holds the links, Entrar and Pedir
  demonstração

#### The demo plays once it is seen, and holds still for reduced motion (rule 9, PAD-656)
- **Given** the coaches' two-phone demo
- **When** it enters the screen
- **Then** it advances one step every 5.8 s and stops at the fifth; pressing a step shows it and stops
  autoplay
- **And** with `prefers-reduced-motion: reduce` it never advances by itself

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

#### The contact dialog sends LevApp's own form, and the browser never reaches HubSpot (PAD-617, PAD-650)
- **Given** a build with a demo form ID and no stored cookie choice
- **When** the visitor presses "Pedir demonstração", fills the form and sends it
- **Then** the dialog is headed "Vamos falar!", links `/privacy`, the request goes to
  `POST /api/public/demo-request` with the fields, `pedido: "demonstracao"` and an empty honeypot,
  no request reaches any HubSpot host, the tracking script was not requested, and the dialog
  says "Obrigado! Vamos falar contigo em breve."
- **When** the visitor opens it from "Falar connosco" instead
- **Then** the request carries no `pedido`
- **When** the API answers 503 or 502
- **Then** the dialog offers a retry and the `mailto:` to the support address

#### The visitor's HubSpot cookie goes along only with consent (PAD-650)
- **Given** a `hubspotutk` cookie in the browser
- **When** the stored choice is `declined` (or there is none) and the visitor sends the form
- **Then** the request carries no `hutk`
- **When** the stored choice is `accepted`
- **Then** the request carries that `hutk`

#### The form refuses an incomplete request before sending (PAD-650)
- **Given** the dialog open
- **When** the visitor sends it with a required field empty, no qualification option chosen, an
  invalid email or phone, or the consent box unticked
- **Then** nothing is posted, the error is announced in Portuguese and focus moves to the first
  invalid field

#### The marketing box follows the subscription config (PAD-650)
- **Given** a build without a marketing subscription id
- **Then** the dialog shows no marketing box
- **Given** a build with one
- **Then** the box shows, unticked, and its state is posted as `marketing`

#### The server relays a valid request and refuses the rest (PAD-617, PAD-650)
- **Given** a configured form GUID and marketing subscription id 12345
- **When** Rita / Pereira Lopes, 912345678, rita@academia.pt, club "Academia Norte", gestão
  `ferramentas_classicas` and `ninguem_trata`, lembretes `diariamente`, tempo `mais_3h`, consent,
  marketing ticked, pedido `demonstracao`, filled in 12 s, is posted from 203.0.113.9
- **Then** `api-eu1.hsforms.com`'s submit receives firstname Rita, lastname Pereira Lopes, phone
  `+351 912 345 678`, `clube_atual` Academia Norte (and no `company`), `levapp_gestao_atual`
  `ferramentas_classicas;ninguem_trata`, the other two values, the three hidden fields, the IP,
  `consentToProcess` with the consent text, and one communication (id 12345, value true, the
  marketing text); the visitor gets 200
- **And** with marketing unticked the communication's value is false; with no subscription id
  there is no `communications`; with no `pedido` there is no `levapp_pedido_site`
- **And** a missing field, an unknown option value or no consent is 400 on that field and nothing
  is sent; a filled honeypot or a 1 s fill is 200 and nothing is sent; the sixth post from one IP
  within the hour is 429; with no form GUID it is 503; a HubSpot error is 502 and the log names
  only the status

#### Without a form ID the demo stays an email
- **Given** a build with no demo form ID
- **When** the landing page renders
- **Then** "Pedir demonstração" is a `mailto:` link to the support address

#### The App Store buttons open LevApp's page in a new tab (rule 15, PAD-619)
- **Given** the landing page for coaches, for players and for others
- **When** it renders
- **Then** coaches show one App Store link under the hero's points, players show one there and one
  in the closing call to action, others show none
- **And** every one points at `https://apps.apple.com/app/id6794271800` with `target="_blank"` and
  `rel` containing `noopener`

#### The site shows the owner's contact address everywhere (PAD-599, B-562)
- **Given** the landing page, `/support`, `public/support.html` and the landing copy in both languages
- **When** any of them offers an email
- **Then** it is `admin@levapp.app`, and `padellevelup2026@gmail.com` / `admin@levapp.pt` appear nowhere

#### A shared link previews levapp.app (rule 16, PAD-595)
- **Given** the built `index.html`
- **When** a link preview reads its Open Graph and Twitter tags
- **Then** `og:url` is `https://levapp.app/`, `og:image` and `twitter:image` are `https://levapp.app/og-image.png`, and `padellevelup.com` appears nowhere

### Notes
- PAD-656 (2026-10-21/22, la-2110-SessionE + la-2110-SessionB on feature/pad-656): the new site from
  the FINAL Claude design replaces the Lovable-port landing page. Owner decisions via the coordinator:
  - the design is final;
  - pages Para treinadores / Para alunos / Outros, Contacto (the PAD-650 form), Privacidade and
    Termos as they are;
  - no Preço section or link and no FAQ, though the pilot claims "Grátis na fase piloto" and
    "Na fase piloto não pagas nada" stay;
  - pt-PT with "tu";
  - media is the App Store screenshots plus HTML mock-ups with mock data, no photos;
  - "Continuar com Google" stays hidden until PAD-618, and `/auth` / `/signup` are untouched;
  - CONTACT_EMAIL replaces the design's admin@levapp.pt;
  - the brand blue is #2854D4.

  Not built: the demo's 5-beat intro overlay. The real-device matrix of the ticket is the owner's
  check after promotion; Lighthouse mobile and the width sweep are run on the switched build.
  Lighthouse result (2026-10-22, coordinator's decision): the ticket's "≥ 90" is **not met on
  performance, with no regression against the live page**. Medians, against the old landing measured
  the same way: coaches 77 vs 69, players 84 vs 69, Outros 81 vs 80. Accessibility is 96/100/100 and
  best practices and SEO are 100. Client rendering holds FCP at ~3.2 s; the prerender of `/` that
  would reach 90 is PAD-726, an owner decision.
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
  management, ~30 min). The measurement used a placeholder form ID. Since PAD-617 the site loads no
  embed, so the measurement no longer gates a promotion (PAD-650); the script stays as a record.
- PAD-650 (2026-10-14): the ticket mapped the club question to `company`; the live form's required
  list (an empty-body submit to both `api.hsforms.com` and `api-eu1.hsforms.com` answered 400
  REQUIRED_FIELD) names `clube_atual`, so that is what is sent (coordinator decision, ticket
  comment). The marketing subscription id is not readable without HubSpot settings access; until
  the owner sets `HUBSPOT_MARKETING_SUBSCRIPTION_ID` the optional box is hidden.
- Known blind spot, guarded separately: resource hints (`preconnect`, `dns-prefetch`) to a HubSpot
  host never show up as requests, so the E2E zero-request guard cannot see them; the static
  `index.html` check in `landing-guards.test.ts` covers them.
- Rule 13's order is tested by outcome: after Recusar the reloaded document reads `declined` and
  runs no tracker; a reload before the write would come back `accepted` and load it again.
