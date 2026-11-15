---
id: P-MOBILE-5
title: "The app feels smooth"
status: draft
---
# The app feels smooth

## Outcome

On an iPhone, typing a message, dragging the week view's day sheet, coming back to the app, and opening a class feel immediate: no stutter under the finger, no spinner flash on resume, no skeleton between weeks.

- An interaction redraws only what it changes: one bubble, one sheet, one query.
- A glance away from the app is not a return to it; coming back from the background is.
- Render counts are measured on the simulator before and after any change to these screens (PAD-571's method).

It does not promise the month grid's cells, the Mensagens and Jogadores list rows, the presences roster, the query cache's timing, or cold start.
