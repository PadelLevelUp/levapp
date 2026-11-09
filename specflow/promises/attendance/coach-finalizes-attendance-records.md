---
id: P-ATTENDANCE-1
title: "Coach finalizes attendance records"
status: draft
---
# Coach finalizes attendance records

## Outcome

After a class has run, the coach reviews who came and locks in the official attendance record in one place, pre-filled from each player's answer, instead of opening every class. Each player's row shows the same single state the class sheet shows (PAD-313), and the same numbers feed the invitation engine's metrics.

- Only classes that have ended can be validated.
- A class cannot be validated while an enrolled player is undecided; the pre-filled guess writes nothing until the coach confirms.
- A player who never answered shows, for display only, as "absent, justified".
- Validating a batch locks only the classes that are ready; the rest stay listed with the reason.
- A walk-in added to a past class takes a real seat in its capacity.
- When a search for a student to add finds nobody, the app says why: already in that class (and where), or not on the coach's list. Never just "not found" (PAD-787).
- Undoing a validation reopens the record and erases nothing.
- Pressing the selected state again returns the player to "no answer yet", as if nobody had answered; it sends the player nothing. If the freed seat was taken meanwhile, the coach is warned the class will be over capacity and may go ahead (PAD-567). A validated class can have a mark taken back too.
- Each justified absence earns one class to make up. A class is made up each time the player accepts a coach's invitation to a free spot, even if they then miss it; joining through their own request does not count. The engine's make-up group and ranking use that number, and the coach sees it as a count, never a percentage (PAD-505).
- A coach sees only their own classes and players.
- Classes waiting to be validated are hard to miss: one count of every waiting class, however old, on the dashboard and the Presences tab, with how many fall in the week shown, more strongly highlighted as they pile up; the dashboard opens the most recent week with something waiting. Undecided players stand out inside a class.
- A class being filled in never jumps away mid-task; it is regrouped only when the page is next opened.
- Present is green, justified amber, unjustified red and nothing chosen grey, never by colour alone.
- iOS has the same reporting as web's Presences tab: charts, filters, column choice and CSV export; on iOS the CSV goes to the share sheet (PAD-166).

It does not promise the player's own confirm, decline or cancel before the class, or the history charts.
