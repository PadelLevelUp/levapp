---
id: B-692
title: "The class's approval cards did not follow the class: a student who joined stayed suggested until the coach reopened it"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - notifications.semi-auto-approval
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/packages/config/src/approval-display.ts
proposed_fix: "Rule 12b: the class view reads its suggestions again whenever it reads the class again, dropping cards no longer pending and keeping one the coach just answered; the Assistant message says what time its queue is from."
opened: 2026-10-28T12:30:00Z
resolved: 2026-10-28T15:00:00Z
---

# B-692: the class's suggestions did not follow the class

**Source:** the owner's report of 27/10 20:41 (Linear PAD-770): a coach's class of capacity 16 in
semi-automatic mode.

**What happens:** a student whose request to join was accepted, and a student who had declined,
were still in the suggested queue, and the spot count was one too high.

**What should happen:** the suggestions follow the class: a student who joined or declined is not
suggested, the spot count follows the open spots, and an older list approved from the message
invites only the students eligible when it is pressed.

**Root cause, two parts:**
- The server side was fixed by PAD-765 (#860, on prod 2026-10-28 10:02), after the report. The
  class view computes each queue when shown (rule 12b), declined students are excluded
  (`_eligible_candidates`), a filled spot's prompt is resolved by the listener, and a "Sim" re-checks
  every student when it sends. PAD-770 adds regression tests for the three cases.
- Incomplete rule, still present: rule 12b said when the list is computed, not when the class view
  reads it again. Both clients read the suggestions only when the class id changed
  (`ClassDetailSheet.tsx` effect deps, `app/class/[id].tsx` `[isCoach, suggestionsInstanceId]`).
  A presence change or an accepted join re-read the class but not its cards, so the cards stayed as
  first loaded until the class was reopened. The Assistant message's queue is a record of when it
  was built, but it did not say so.

**Fix:** rule 12b gains two sentences: the message reads "Fila às HH:MM", and the class view
re-reads its suggestions with the class. `mergeSuggestionBundles` and `queueAsOfLabel` live in
`@levelup/config`, used by web and iOS. Tests: `test_pad770_suggestions_follow_the_class.py`,
`ClassDetailSheet.liveSuggestions.test.tsx`, `ReplacementApprovalCard.test.tsx`,
`class-suggestions-refresh.test.ts`, `approval-display.test.ts`.
