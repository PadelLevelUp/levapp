---
id: B-689
title: "The class showed only the newest pending approval prompt, and a prompt stayed pending after its spot filled another way, so one class's older spot waited unseen for six days"
type: wrong-rule
severity: medium
status: resolved
affects:
  - notifications.semi-auto-approval
  - backend/padel_app/services/replacement_approval_service.py
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "Rule 12 lists every pending bundle in decline order with the queue computed when shown (12b); rule 11's stale marking moves to a before_flush listener on the vacancy's status, which also annotates the Assistant message; both clients render one card per bundle and read `resolved` as stale."
opened: 2026-10-27T21:00:00Z
resolved: 2026-10-27T21:00:00Z
---

# B-689: approval prompts hidden and left pending

**Source:** prod rows read by SessionH and D's code read at main 9c62d538d, 2026-10-27. Linear
PAD-765.

**What happens:**
- Two declines a week apart (cases 7 and 8) each got a prompt in its own bundle. The class sheet
  showed only the newest; the older one existed only in the Assistant chat.
- The older spot was then filled by an accepted join request. Its prompt stayed `pending` and its
  message kept the buttons.
- The prompt's queue was the snapshot from build time: it listed a student enrolled since.

**What should happen:** the class shows every pending prompt, oldest spot first, with the list as the
class is now; a spot that fills or expires stops asking at once, and its message says so.

**Root cause:**
- Defect 1, wrong rule: `semi-auto-approval` rule 12 said the class view gets "the newest pending
  bundle", and `instance_suggestions` did exactly that (prompt id desc, first match).
- Defect 2, incomplete rule: rule 11 said the prompt "becomes stale" but not when; the code marked it
  only when the coach pressed a button (`respond_to_approval`).
- Also found, web only: the sheet's class-id reset cleared the card when the class loaded after the
  suggestions answer.
- The round labels were not a numbering bug: the prompt and the engine both use the 1-based group
  number. The label was frozen at build time.

**Fix:** rules 11, 12 and 12b. Tests: `backend/padel_app/tests/test_pad765_approval_prompt_lifecycle.py`,
`ClassDetailSheet.approvals.test.tsx`, and the card and helper tests.

**Resolution addendum (PAD-780, 2026-10-28):** the listener only sees a status change flushed after
it shipped, so prompts on spots closed before PAD-765 stayed `pending` until the coach tapped them
(160 on prod, read by SessionH). The invitation tick now resolves every pending prompt whose spot is
not `open`, through the same `resolve_prompts_for`, one commit per spot, and logs
"orphaned approval prompts: resolved N" when N > 0 (rule 11's last sentence). Tests:
`backend/padel_app/tests/test_pad780_orphaned_approval_prompts.py`.
