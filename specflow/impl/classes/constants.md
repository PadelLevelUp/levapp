---
constants:
  CAP_PRIVATE_CONFIRM: "private-confirm"              # X-LevApp-Capabilities token: the client shows the private-lesson warning (classes.join-requests rule 22)
  REFUSAL_PRIVATE_UNCONFIRMED: "private_unconfirmed"  # 409 code: a private join or waiting-list join without the confirmation
  LESSON_LIST_TYPES: ["academy", "private"]           # values of the academy-classes read's `type`; the first is the default
  COACH_REQUESTS_PAGE_SIZE: 25
  COACH_REQUESTS_MAX_PAGE_SIZE: 100
  COACH_REQUESTS_QUERY_BUDGET: 13
  PRIVATE_REQUEST_OPEN_STATUSES: "pending, countered"
  JOIN_REQUEST_OPEN_STATUSES: "pending"
  COACH_REQUESTS_STATUS_ORDER: "pending, countered, accepted, declined, rejected, withdrawn, superseded"
---

# classes constants

Values more than one `classes/` spec uses. `academy-class-booking`, `join-requests` and `class-requests` read them.
- `COACH_REQUESTS_PAGE_SIZE`: rows per page of the coach's requests table when the client sends no
  `per_page` (`classes.coach-requests-table` rule 4; PAD-795). The roster's own default
  (`players.list`, `coach_players_paginated`), reused so the coach's two paged lists page alike.
- `COACH_REQUESTS_MAX_PAGE_SIZE`: the largest `per_page` the table endpoint honours; a larger value is
  clamped to it (`classes.coach-requests-table` rule 4). The roster's clamp.
- `COACH_REQUESTS_QUERY_BUDGET`: the most SQL statements one request to the table endpoint may issue,
  counted at the cursor for the whole request, authentication included, whatever the coach's total number
  of requests and whatever the page size (`classes.coach-requests-table` rule 8). The count it comes from
  is in that spec's Performance section. A hard bound: raising it is an amendment with a reason.
- `PRIVATE_REQUEST_OPEN_STATUSES`: the statuses of a private class request (`classes.class-requests`)
  that are still open — awaiting the coach (`pending`) or the student (`countered`). Every other status
  is closed. The server's "Em aberto" section and `@levelup/config` `isOpenClassRequestRow` read this
  one list (`classes.coach-requests-table` rule 3, `classes.join-requests` CLASSES-JOIN-REQUESTS-25).
- `JOIN_REQUEST_OPEN_STATUSES`: the statuses of an academy join request (`classes.join-requests`) that
  are still open. Same two readers as above.
- `COACH_REQUESTS_STATUS_ORDER`: the order the table sorts the status column in, ascending
  (`classes.coach-requests-table` rule 5): open statuses first, then the closed ones.
