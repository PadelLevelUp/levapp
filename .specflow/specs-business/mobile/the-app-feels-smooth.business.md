---
id: mobile.the-app-feels-smooth
status: draft
implemented_by:
  - ../../specs/mobile/interaction-performance.spec.md
---

# The App Feels Smooth

## Outcome

Typing a message, dragging the day-sheet on the week view, coming back to the app from Control
Centre or a call, and opening a class feel immediate on an iPhone: no stutter under the finger,
no spinner flash on resume, no skeleton between one week and the next.

## Who This Is For

Coaches who live in the app between classes — chatting, checking the week, opening the next
class — and the students they write to.

## User Journey

1. A coach types a twenty-character reply in a busy thread; every character lands as typed.
2. On the week view she drags the day-sheet up and down; it follows the finger.
3. She pulls down Control Centre and lets it go; the screen is as she left it, nothing reloads.
4. She swipes to next week; this week's classes stay until next week's are there.
5. She opens a class; its courts appear once, with the class.

## Business Rules

1. An interaction redraws only what it changes (one bubble, one sheet, one query).
2. A glance away from the app is not a return to it; coming back from the background is.
3. Measured, not assumed: render counts on the simulator before and after any change to these
   screens (PAD-571's method).

## Success Metrics

- Twenty keystrokes in a thread with fifty messages re-render no bubble (was: every mounted
  bubble per keystroke).
- A sheet drag re-renders the week grid zero times per frame (was: once per frame).

## Out of Scope

- The month grid's cells, the list rows of Mensagens and Jogadores, and the presences roster
  (follow-ups if measured).
- The query cache's stale time and the web app's focus refetch (`client.query-cache`, PAD-586).
- Cold start (`mobile.the-app-opens-fast`, PAD-587).

## Notes

- OPEN: none.
