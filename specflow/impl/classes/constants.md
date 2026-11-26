---
constants:
  CAP_PRIVATE_CONFIRM: "private-confirm"              # X-LevApp-Capabilities token: the client shows the private-lesson warning (classes.join-requests rule 22)
  REFUSAL_PRIVATE_UNCONFIRMED: "private_unconfirmed"  # 409 code: a private join or waiting-list join without the confirmation
  LESSON_LIST_TYPES: ["academy", "private"]           # values of the academy-classes read's `type`; the first is the default
---

# classes constants

Values more than one `classes/` spec uses. `academy-class-booking`, `join-requests` and `class-requests` read them.
