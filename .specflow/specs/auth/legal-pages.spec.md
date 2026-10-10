---
id: auth.legal-pages
status: implemented
depends_on: []
implements: ../../specs-business/auth/anyone-can-read-the-terms-and-privacy-policy.business.md
governs:
  - frontend/apps/web/src/pages/LegalPage.tsx
  - frontend/apps/web/src/content/legal/**
  - frontend/apps/mobile/src/lib/config.ts
---

# Legal pages: /terms and /privacy

### Intent
The Terms of Service and the Privacy Policy are published as web pages rendered from markdown
files kept in the repository, with a version and effective-date header and a language switch, so
publishing a new version is a content change, both apps link to one source, and the store
listings have stable URLs (PAD-601, replacing the hard-coded JSX pages of PAD-219's era).

### Entities
- **Legal document** (`frontend/apps/web/src/content/legal/index.ts`): `id` (`terms` | `privacy`),
  `version` (the effective date in ISO form), `effectiveDate` (as the text states it), `bodies`
  (markdown per language). The markdown bodies live beside the index as `en/<id>.md` and, once
  published, `pt/<id>.md`.
- **Drafts** (`content/legal/drafts/<version>/<lang>/<id>.md`, when one is staged): texts kept
  for review, never imported by the app. None is staged: v2026-10-10 (18+, Sucesso Fractal – Lda
  as controller, delete path, admin@levapp.app) is published from the owner's final .docx.

### Rules
1. **One source, rendered.** `/terms` and `/privacy` render `LegalPage`, which renders the
   document's markdown body (`react-markdown`, no raw HTML) inside the app shell; internal links
   in the text (`/privacy`, `/terms`, `/auth`) are router links. The hard-coded pages are gone.
2. **The header says what is in force.** Above the body the page shows the document's `version`
   and `effectiveDate` (test ids `legal-version`, `legal-effective-date`); the effective date in
   the header equals the "Effective date" line in the text (pinned by test).
3. **Language.** `?lang=pt|en` picks the language, else the UI language (a `pt*` locale → PT),
   else English; an EN | PT switch (`legal-lang-en`, `legal-lang-pt`) rewrites the query and the
   cross-link between the two documents keeps it. English prevails: while a language has no body
   the page renders the English body under the notice "Versão portuguesa em preparação — prevalece
   a versão inglesa." (`legal-fallback-notice`) and marks the page `lang="en"`; once a translation
   is published its body carries its own precedence line. The iOS app opens the hosted pages
   through `legalUrl(base, i18n.language)` (`?lang=` from the account's language) from the sign-up
   form, the pre-auth legal links and Settings → Legal; it keeps no copy of the text.
4. **Publishing a version** means replacing the live markdown, the `version`/`effectiveDate`
   in the index and `TERMS_VERSION`/`PRIVACY_VERSION` (`auth.register` rule 19) in one commit,
   all three tied by a test; a drafts folder is for review only and nothing imports it
   (no `import.meta.glob` reaches it).
5. **Store listings** link to `https://levapp.app/privacy` (App Store Connect
   `appInfoLocalizations.privacyPolicyUrl`, both locales) and `/terms`; the legacy
   `padellevelup.com` host keeps serving both paths through the SPA fallback.

### Acceptance Criteria

#### The English terms render with their version header (rules 1–2)
- **Given** the terms document
- **When** `/terms` is opened
- **Then** the body's `h1` reads "Terms of Service", `legal-version` shows the document's version and `legal-effective-date` its effective date, no fallback notice is shown, and the EN switch is current

#### Portuguese falls back to English with the notice (rule 3)
- **Given** no Portuguese body is published
- **When** `/terms?lang=pt` is opened
- **Then** the English body renders under `legal-fallback-notice`, the page is marked `lang="en"`, the PT switch is current, and the cross-link points at `/privacy?lang=pt`

#### The iOS app opens the hosted pages in the account's language (rule 3)
- **Given** the sign-up form's terms box
- **When** the privacy and terms links are tapped
- **Then** the URLs opened end in `/privacy?lang=<en|pt>` and `/terms?lang=<en|pt>`

#### The header never disagrees with the text (rule 2)
- **Given** each live document
- **Then** its markdown contains `Effective date: <effectiveDate>` exactly as the index states it
