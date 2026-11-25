---
constants:
  PUSH_REFUSAL_RESEND_DAYS: 3
---

# impl constants

Facts the specs of more than one area must agree on.

- `PUSH_REFUSAL_RESEND_DAYS`: how long a client waits before it reports a still-refused notification
  permission again (`admin.engine-health` rule 8e, `messaging.push-notifications` rule 18,
  `auth.push-subscription` rule 13). It must be shorter than `MESSAGE_RECIPIENT_WINDOW_DAYS`
  (`specflow/impl/admin/constants.md`), the window the page counts refusals over, so one missed
  report does not drop a refusal out of the count.
