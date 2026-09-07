---
id: auth.visitor-picks-an-audience-and-finds-the-way-in
status: implemented
implemented_by:
  - ../../specs/auth/landing-page.spec.md
---

# Visitor picks an audience and finds the way in

## Outcome

Someone who lands on levapp.app without an account understands within a screen what LevApp does
*for them* — a coach sees classes filling themselves and hours saved, a player sees last-minute spots
and one-tap confirmations, anyone else sees an open door for ideas — and is one click from the right
next step. Coaches ask for a demo; players sign in or get help with a lost invitation; partners send
an idea.

## Who This Is For

- Academy owners and coaches evaluating software — the buyer.
- Players whose academy already uses LevApp and who arrived at the website instead of the app.
- Clubs, partners and the curious — people we want to hear from but have nothing to sell to yet.

## User Journey

1. The visitor opens the site and sees the coach story by default, with real screens of the product
   on a laptop, a phone and a watch.
2. Three tabs at the top let them switch to the player story or to "Others"; the whole page follows
   the choice — hero, benefits, how it works, results, and the closing call to action.
3. A coach reads the three benefits (less admin, more revenue, more competitive classes), the
   three-step onboarding, and the results, then asks for a demo by email.
4. A player sees what they gain, how to get started, and signs in — or asks support for help if
   their invitation is missing.
5. A partner is told plainly that there is nothing for them yet and invited to email an idea.
6. Anyone can reach the login, contact, privacy and terms pages from the header and footer.

## Business Rules

- The page is public and never shows the signed-in app; a signed-in user opening the site goes
  straight to their dashboard.
- Web-only by design: the iOS app is for people who already have an account, and its marketing
  surface is the App Store listing.
- A shareable link can open the page directly on an audience (`?audience=…`).
- No forms or backend: every call to action is a link — email, login, support, or an anchor.
- Copy is Portuguese by default with an English translation; product screenshots stay Portuguese.

## Success Metrics

- Demo-request emails from coaches arriving at the support inbox.
- Players reaching `/auth` from the landing page rather than bouncing to support.
- Idea emails from the "Others" audience.
