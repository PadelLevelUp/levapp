---
id: P-AUTH-8
title: "Visitor picks an audience and finds the way in"
status: implemented
---
# Visitor picks an audience and finds the way in

## Outcome

Someone who lands on levapp.app without an account understands within a screen what LevApp does for them, and is one click from the right next step: coaches ask for a demo, players sign in or get help with a lost invitation, partners send an idea.

- The page is public and never shows the signed-in app; a signed-in user goes straight to their dashboard.
- It is web only; the iOS app's marketing is its App Store listing.
- A link can open the page on an audience (`?para=jogadores`; older `?audience=…` links keep working), and choosing an audience puts it in the URL.
- Every call to action is a link, except the contact request, which the site's own server passes to the sales CRM so the browser never talks to HubSpot (PAD-617, PAD-650). It asks consent to handle the visitor's data and, separately and optionally, to send news and offers.
- Visits are measured with HubSpot only after the visitor accepts cookies, and declining is as easy as accepting. The choice can be changed from the footer and is asked again after 12 months.
- Text is Portuguese by default with an English translation; product screenshots stay Portuguese.
- Coaches and players reach the App Store page from the top of their page, and players again from "Grátis para alunos", in a new tab (PAD-619).
- The site shows no prices: the pilot is free for coaches and the app is free for students.
