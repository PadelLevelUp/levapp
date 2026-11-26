---
constants:
  PUSH_REFUSAL_RESEND_DAYS: 3
  DECLINE_SOURCE_AVAILABILITY_BLOCK: "availability_block"
---

# impl constants

Facts the specs of more than one area must agree on.

- `PUSH_REFUSAL_RESEND_DAYS`: how long a client waits before it reports a still-refused notification
  permission again (`admin.engine-health` rule 8e, `messaging.push-notifications` rule 18,
  `auth.push-subscription` rule 13). It is shorter than `MESSAGE_RECIPIENT_WINDOW_DAYS`
  (`specflow/impl/admin/constants.md`), the window the page counts refusals over, so a student who
  opens the app at least once in the window stays in the count; one who does not open it leaves it.
- `DECLINE_SOURCE_AVAILABILITY_BLOCK`: the value of `presences.decline_source` (served as
  `declineSource`) for a decline the student made by answering yes to the covered-classes question
  after saving an availability block (`calendar.student-blockers` rules 22–23, `attendance.confirm`
  rule 30). The backend writes it; web and iOS read it to choose the coach's detail line. Any other
  decline leaves the field null.
