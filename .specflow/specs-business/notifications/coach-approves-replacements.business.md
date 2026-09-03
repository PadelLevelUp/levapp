---
id: notifications.coach-approves-replacements
status: draft
implemented_by:
  - ../../specs/notifications/semi-auto-approval.spec.md
---

# Coach approves replacements

## Outcome

A coach who wants a say in every replacement — not just a passive audience to whatever the engine
sends — can switch to semi-automatic mode. Instead of invitations going out the moment a spot
opens, the coach gets a message from the platform assistant showing who dropped out and the exact
order the engine would invite people in. They approve it (now, or when the invitation window
opens), or they say no and handle it manually instead.

## Who This Is For

A coach who wants to stay in the loop on every replacement decision rather than letting the engine
act unsupervised — particularly one running a smaller or more relationship-driven academy.

## User Journey

1. The coach turns on semi-automatic mode in their notification settings.
2. A student cancels, or the coach marks someone absent during attendance confirmation, and a spot
   opens.
3. Instead of invitations going out, the coach receives a message from the platform assistant: who
   declined, and the full ordered list of students the engine would invite, round by round.
4. If several spots open from the same attendance confirmation, the coach sees one bundled card
   covering all of them, not a separate prompt per spot.
5. The coach taps "Yes, right now" to send invitations immediately, "Yes, at [time]" to let them go
   out when the normal invitation window opens, or "No" to decline — in which case the spot stays
   open but the engine leaves it alone, and the coach can still notify people manually.
6. If a standing waiting-list student would be placed directly (no invitation needed), the coach
   sees that called out in the prompt before they decide.

## Business Rules

- This only applies when the coach has both turned the engine on and chosen semi-automatic mode;
  fully automatic coaches never see a prompt and their invitations go out exactly as before.
- Every prompt lives in the coach's assistant conversation as the permanent record, regardless of
  which screen first showed it to them.
- The list of students shown in the prompt is exactly the list the engine may invite from — it can
  never invite someone who wasn't shown, though it re-checks eligibility at send time, so someone
  shown may later be skipped, and (rarely) someone not shown may qualify by send time if their own
  situation changed in between.
- A decision is final: once a coach dismisses a prompt, it can't be revived — they'd need to trigger
  a new one or invite manually.
- Saying no doesn't close the spot. It just means the engine stays out of it; the coach keeps every
  other tool (manual invitations, waiting list) available.
- A standing waiting-list placement also waits for the coach's approval in this mode — it never
  places a student behind the coach's back just because it wouldn't have needed to "ask" them.

## Success Metrics

Not yet measured.

## Out of Scope

- The matching rounds and criteria themselves — those are unchanged from fully-automatic mode and
  covered in "Coach fills vacancies automatically".
- Configuring the invitation timing and message wording — see "Coach tunes the invitation engine".

## Notes

- This is a `draft`-status leaf (`notifications.semi-auto-approval`) — the feature is specced but
  its implementation status should be verified against the leaf before treating it as shipped.
