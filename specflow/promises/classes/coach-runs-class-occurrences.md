---
id: P-CLASSES-1
title: "Coach runs class occurrences"
status: implemented
---
# Coach runs class occurrences

## Outcome

Once a class exists, the coach manages its occurrences day to day (who teaches each one, who is enrolled for the series or one session), while each occurrence's record is created only when something needs it.

- An occurrence of a recurring class becomes a record only when something needs it.
- Creating an occurrence on demand is safe to repeat and never makes duplicates.
- Enrolling at the class level puts a player in every future occurrence; at the occurrence level, in that one session only.
- A class can have more than one coach, and an occurrence's assignment can override the class's.
- A failing side effect of creating an occurrence (such as syncing a waiting list) is logged and never blocks the occurrence or the coach's action.

It does not promise editing the class template, a student's request to join, or marking attendance.
