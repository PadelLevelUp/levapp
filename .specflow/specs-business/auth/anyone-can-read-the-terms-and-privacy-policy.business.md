---
id: business.auth.anyone-can-read-the-terms-and-privacy-policy
status: implemented
implemented_by:
  - ../../specs/auth/legal-pages.spec.md
---

# Anyone can read the Terms of Service and the Privacy Policy

## Outcome

A visitor, a signing-up student or coach, a signed-in user on the web or in the iOS app, and an
app-store reviewer can all open the current Terms of Service and Privacy Policy at stable public
addresses, see which version is in force and since when, and read them in their language where a
translation exists.

## Journey

1. A visitor opens levapp.app/terms or levapp.app/privacy (from the landing page, the sign-up
   form, the Settings screen, an app-store listing, or a link in an email) and reads the full
   text on one page, with its version and effective date at the top.
2. A Portuguese-speaking user switches to PT. While the Portuguese translation is in
   preparation, they read the English text under a short Portuguese notice saying the English
   version prevails; once the translation is published, they read the Portuguese text with the
   same notice about precedence.
3. The iOS app opens those same pages, in the account's language, from the sign-up form and
   from Settings → Legal; there is no separate in-app copy that could drift.

## Business rules

- The published text is the source of truth for what the product promises; the pages change
  only when the operator publishes a new version, and the version and effective date on the
  page always match the text (PAD-601, 2026-10-10: the v2026-10-10 texts are published only
  once the lawyer-reviewed documents are in hand; until then the previous text stays live).
- English is the prevailing language; a Portuguese version is a courtesy translation.
- The pages are public, need no account, and are served by the web app so the store listings
  and the apps can link to them.

## Success metrics

- Both pages return the current text at `/terms` and `/privacy` on levapp.app (and the legacy
  padellevelup.com) at all times; the App Store listing's privacy URL points at `/privacy`.
