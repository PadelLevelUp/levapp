---
id: mobile.student-on-a-phone-finds-the-ios-app
status: draft
implemented_by:
  - ../../specs/mobile/install-suggestion.spec.md
---

# A Student on a Phone Finds the iOS App

## Outcome

A student who opens the web app on an iPhone learns, once and without being blocked, that the
iOS app exists and is the better way to use LevApp on a phone — push notifications and a native
chat — and can get to its App Store listing in one tap. Coaches, desktop browsers and Android
phones are not nudged.

## Who This Is For

Students on an iPhone who reached the web app by a link (a coach's join link, a notification
email, a shared URL) and would otherwise stay on the mobile website.

## User Journey

1. A student signs in to the web app on an iPhone.
2. Above the page a small card says the iOS app is on the App Store and why it is better, with
   "Ir para a App Store" and "Agora não".
3. "Ir para a App Store" opens the listing. "Agora não" hides the card on that phone for 30
   days; it never comes back on the next page load, and it never covers or blocks the page.
4. In Safari the phone may also show Apple's own Smart App Banner, which opens the app directly
   when it is already installed.

## Business Rules

1. Students only; a coach never sees the suggestion (coaches run the academy from the desktop
   and the owner decided they are not the audience — PAD-573).
2. iPhone-class browsers only. Desktop browsers see nothing. Android sees nothing: there is no
   Android app in a store yet, and an "honest message" with no link would only be noise.
3. Dismissing hides it for 30 days on that device. It is a suggestion, never a hold.
4. The copy follows the app's language (Portuguese or English).
5. Web-only by nature: it is a prompt to leave the web app for the iOS one.
6. No measurement: the app has no analytics beyond the landing page's consent-gated HubSpot
   tracker, which never runs in the signed-in app. Tracking is added when analytics exist.

## Success Metrics

- A student on an iPhone sees the suggestion on the first signed-in page and not again for 30
  days after dismissing it.
- Nobody else sees it.

## Out of Scope

- An Android nudge (no store listing yet).
- In-app analytics.

## Notes

- OPEN: none.
