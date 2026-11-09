---
id: P-DASHBOARD-1
title: "User relies on the dashboard"
status: implemented
---
# User relies on the dashboard

## Outcome

On opening the app, a coach or a student lands on a dashboard built for their role: blocks summarising what needs their attention now, each clickable through to the exact place it describes.

- The dashboard is server-driven: an ordered set of typed blocks, assembled per request for that user.
- Coaches and students see different dashboards in one shared visual language.
- An invite the student has not answered is shown as something to resolve, including the chat asks "a spot opened, want it?" and "want to join the waiting list?", answered there with the same Yes/No, once: answering on the dashboard settles the chat message and the other way round.
- A number agrees with the list next to it: a student's "upcoming lessons" counts the classes on their schedule, answered or not.
- The coach's "Needs you" queue offers only this week's (Sunday to Saturday) classes that still have room. A message awaiting reply always shows as a compact card.
- On the coach's dashboard, at a class's start time in the coach's time zone, its "still has room" card leaves "Needs you". While it runs, the next-class card says it is in progress ("A decorrer · 19:30–21:00"), and its row in the next 7 days shows no free-seats warning or invite button; at its end the card moves on. Classes running at the same time each get their own in-progress card.
- "Later" pushes a "still has room" card out of the queue for a day, on every device, and it returns by itself; the class is untouched.
- A card is clickable only when a working destination exists.
- The "classes to validate" number on the dashboard is the number the Presences tab shows when the card opens it. The number is the whole backlog still to validate, however old, and the card opens the tab on the most recent week that has work.
- Clicking an upcoming class opens that exact occurrence's details.
- "Tomorrow" and other day-relative counts use the coach's own local day.

It does not promise the behaviour of the pages the cards link to.
