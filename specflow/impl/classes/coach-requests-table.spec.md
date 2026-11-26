---
id: classes.coach-requests-table
status: draft
depends_on: [classes.class-requests, classes.join-requests, players.search, players.list, players.nickname]
serves: [P-CLASSES-4]
governed_by: []
---

# classes.coach-requests-table

### Intent
PAD-795. A coach's "Pedidos de Aula" (web `/class-requests`, iOS Settings → Pedidos de Aula) is one
long list today, hard to scan and with no way to find one request. It becomes one table holding both
request kinds — private class requests (`classes.class-requests`) and academy join requests
(`classes.join-requests`) — split into **Em aberto** and **Histórico**, read a page at a time from the
server, sortable and filterable on web, and shown as compact rows with the same data and filters on
mobile.

Owner's decision (25 Nov 2026, final): "one table for both request kinds (Em aberto / Histórico), only
the statuses that exist today, server-side pages, web table with sort and filters, compact rows on
mobile. Spec first with a fresh-agent review, web and iOS together, own PR, no status added."

### Entities
- No new entity, column or status. **READS:** ClassRequest (`classes.class-requests`), ClassJoinRequest
  and its LessonInstance (`classes.join-requests`), the requesting coach's relation row for each student
  (`Association_CoachPlayer`: nickname, profile side; `players.nickname`).

### Rules
1. **One list, two kinds, the coach's only.** `GET /app/coach-requests` returns the caller's private
   class requests (`class_requests.coach_id`) and academy join requests (`class_join_requests.coach_id`)
   as one list. It is coach-only: a caller with no coach profile gets `403` before any query runs
   (`players.list` rule 7's pattern, `require_coach()`). Students keep their own list (Not this spec).
   Each row carries:
   - `kind` (`private` | `academy`) and `id` (unique within its kind; the pair is the row's key);
   - `playerId`, `playerName` (the real name, `players.nickname` rule 2) and the three fields of
     `players.nickname` rule 9(a) from the requesting coach's relation row (`nickname`,
     `nicknameAsName`, `displayName`, through `player_service.nickname_payload`), batch-loaded;
   - `date`, `startTime`, `endTime`: the class's club-local wall clock. A private request's is the slot
     on the table, `start_datetime` / `end_datetime`. For a weekly request that is the first occurrence
     the student asked for, moved by a proposal or counter-proposal (`classes.class-requests` rule 16),
     and, when the request was accepted after that occurrence had started, the first occurrence still
     ahead at the accept (`class_request_service._create_class_and_accept`, `classes.class-requests`
     rule 17). An academy request's is its `LessonInstance`'s;
   - `classTitle` (academy only, else null), `recurrence` (private only, as today);
   - `createdAt` and `decidedAt` (instants stored in UTC, serialized through `utils/dates.to_utc_iso`
     so they carry their offset; the shells show them in the club's time zone), `decidedBy` (private:
     `coach` | `student`; academy: `coach` when `decided_by_coach_id` is set, else null), `note`,
     `status`;
   - `side`: academy `left` | `right` | `both` | null (`class_join_request_service.SIDES`,
     `classes.join-requests` rule 20); private always null — private requests have no side;
   - every field today's row actions read (private: `participants`, `lessonId`, `coachId`; academy:
     `lessonInstanceId`, `suggestedProfileSide`), so the row's actions work from this row alone.
2. **The statuses are the ones that exist today; none is added.** Private: `pending`, `countered`,
   `accepted`, `declined`, `withdrawn`. Academy: `pending`, `accepted`, `rejected`, `withdrawn`,
   `superseded`. There is no `expired` status and no "accepted automatically" marker; neither is derived.
3. **Em aberto and Histórico.** `section=open` holds a private row whose status is in
   const:PRIVATE_REQUEST_OPEN_STATUSES and an academy row whose status is in
   const:JOIN_REQUEST_OPEN_STATUSES; `section=history` holds every other row. Every row is in exactly
   one section. This is the split `@levelup/config` `isOpenClassRequestRow` makes today, and both read
   the same constants. A missing `section` is `open`; any other value answers
   `400 {code: "invalid_filter", field: "section"}`.
   The response carries both sections' totals as `counts: {open, history}`. The requested section's
   count applies every filter; the other section's count applies every filter except `status`
   (rule 7: a status filter belongs to one section).
4. **Server-side pages.** Params `page` (1-based) and `per_page` (default const:COACH_REQUESTS_PAGE_SIZE,
   clamped to 1..const:COACH_REQUESTS_MAX_PAGE_SIZE). As the roster does (`players.list` rule 2), a
   missing, non-integer or below-1 `page` reads as 1, and a missing or non-integer `per_page` as the
   default. The response is the roster's shape:
   `{items, pagination: {page, perPage, total, pages, hasNext, hasPrev}, counts: {open, history}}`.
   Filters and sort apply across both kinds before the page is cut, so the pages of one section, read
   in order, list each of its rows exactly once. A page past the end is an empty `items` with the true
   `total`, never an error.
5. **Sort.** `sort_by` ∈ `class_date`, `class_time`, `requested_at`, `student`, `kind`, `side`,
   `status`; `sort_dir` ∈ `asc`, `desc`.
   - `class_date`: the class start (date then time, wall clock).
   - `class_time`: the class's time of day (wall clock), then the class date.
   - `requested_at`: the request instant; the "Pedido: dia" and "Pedido: hora" columns both sort by it.
   - `student`: `displayName` (rule 1), case-insensitive.
   - `kind`: `academy` before `private` ascending.
   - `side`: `left`, `right`, `both`, then rows with no side, ascending.
   - `status`: by const:COACH_REQUESTS_STATUS_ORDER.
   **Nulls:** a null request instant (`class_requests.created_at` is nullable) counts as the earliest
   instant, on SQLite and on Postgres alike (an explicit nulls-first / nulls-last per direction, never the
   engine's default), in the sort and in the tie-break; `requested_from` / `requested_to` never match it.
   **Tie-break, after every sort:** request instant descending (null last), then `kind` ascending
   (`academy` first), then `id` descending — so a page boundary never repeats or skips a row. A missing
   or unknown `sort_by` or `sort_dir` uses the section's default (rule 6).
6. **Default order (from the ticket).** Em aberto: `class_date` ascending — the request for the nearest
   class first. Histórico: `requested_at` descending — the newest request first. Each tab keeps its own
   order: changing the tab drops the sort the coach chose, so the new tab opens on its own default (the
   clients, as they do with the status filter).
7. **Filters, all ANDed, all optional.**
   - `kind=private|academy`;
   - `status=<s>[,<s>…]`: statuses of the requested section only (a status of the other section matches
     nothing). It belongs to that section: the clients clear it when the tab changes (rules 11, 12),
     and the other section's count ignores it (rule 3);
   - `side=left|right|both|none` (`none` = no side, which includes every private row);
   - `class_from`, `class_to` (club-local `YYYY-MM-DD`, inclusive) on the class date;
   - `class_time_from`, `class_time_to` (`HH:MM`, inclusive) on the class's time of day;
   - `requested_from`, `requested_to` (club-local `YYYY-MM-DD`, inclusive) on the request instant: a
     request belongs to the club-local day (`club-local-day`) its UTC instant falls in, so the bounds are
     that day's boundaries turned into UTC (`club-local-day-boundary`);
   - `player_id=<id>`: one student;
   - `id=<id>` with `kind`: one request, whatever its section (rule 16);
   - `search=<text>` (owner, 26 Nov 2026: the requests table is a search surface): the student's name or
     the coach's nickname for them, matched by `players.search`'s one rule
     (`player_service.rank_player_match` over `{name, nickname}`; a match is any tier): the server reads
     the coach's distinct requesters in one statement (a set the size of the coach's students, not of
     their requests), matches them in Python, then filters the rows by those player ids in SQL, before
     the page is cut, in both sections and in their counts. A blank value is no filter; a value with no
     letter or digit finds nobody. It joins the other filters (`player_id` included) and never reaches a
     request of another coach. The table keeps its own sort; tiers do not reorder it.
   A malformed value answers `400 {code: "invalid_filter", field}`; it never silently widens the list.
8. **A page costs the same whatever the coach's history.** The number of SQL statements one request to
   the endpoint issues — counted at the cursor (`before_cursor_execute`), the whole request including
   authentication, as `test_pad204_conversation_list_perf._statement_counter` counts — does not grow
   with the number of requests the coach has nor with the rows on the page, and never exceeds
   const:COACH_REQUESTS_QUERY_BUDGET. The rows are selected, sorted and cut in SQL across both tables;
   the page's students, relation rows, classes and invitees are loaded in batches, never one query per
   row (today's serializers lazy-load per row).
9. **The old list endpoints are unchanged.** `GET /app/class-requests` (`classes.class-requests` rule 9)
   and `GET /app/class-join-requests` (`classes.join-requests` rule 17) keep their rows, order and
   shape: the student's list and installed builds that predate this spec read them.
10. **A status reads the same words in the table, the list and the chat bubbles.** The table on both
    shells names a status with the coach-side keys that exist today, `classRequests.coachStatus.<status>`
    (`frontend/src/locales/{pt,en}/classRequests.json`; read by `ClassRequestsSection` on web and iOS and
    by the academy request bubble on both), through one `@levelup/config` function
    `coachRequestStatusKey(kind, status, decidedBy)`. The one wording that does not exist today is a
    private `declined` that the STUDENT decided (a proposal they refused): it gets a new key
    `classRequests.coachStatus.declinedByStudent`, **proposed copy for the owner: pt "Recusado pelo
    aluno", en "Declined by the student"**. Every other (kind, status) maps to `coachStatus.<status>`
    unchanged. The status filter lists the same words.
11. **Web: a table.** The coach's page shows two tabs, "Em aberto (n)" and "Histórico (n)" (`counts`),
    Em aberto selected on arrival. The table's columns, in this order: Aula (day and time, on two lines)
    · Pedido (day and time, on two lines) · Aluno (`displayName`) · Tipo de aula (Academia / Privada) ·
    Lado preferencial (Esquerda / Direita / Ambos / —) · Estado, plus an actions column in Em aberto: the
    eight fields of the ticket, each still its own sort — the Aula header carries one control for the day
    ("dia") and one for the time ("hora"), the Pedido header the same (both sort by `requested_at`), every
    other header sorts by its own key; pressing the active control flips the direction. The table fits its
    card with the sidebar open from 1024 px up, with no sideways scroll: the actions column shows
    "Aceitar" and a "…" menu holding the other actions (Recusar, Propor outro horário; Rejeitar for an
    academy row). Dates read in the app's short date format of the language (`formatShortDate`, as the
    class-request wizards print them), times as HH:MM. Filters sit
    above the table: a student search box (rule 7 `search`; it waits 200 ms after the last keystroke and
    shows the feedback lines of `players.search` rule 10), kind, status (the section's statuses), side, a class date range, a class
    time range and a request date range, with one "Limpar filtros". Changing a sort or a filter returns
    to page 1; changing the tab returns to page 1, clears the status filter and the chosen sort (rule 6).
    A pager under the table
    shows the page, the page count and previous/next. Sort, filters, tab and page live in the URL query,
    so a reload or a shared link reopens the same view.
12. **Mobile: its own screen, compact rows.** Pedidos de Aula leaves the Settings scroll view
    (`app/settings.tsx`) and becomes its own screen, opened from the same Settings entry
    (`settings-nav-classRequests`). The route installed builds' chat bubbles push,
    `/settings?section=classRequests&proposeFor=<id>`, still lands on it (rule 16). It reads the same
    endpoint and shows the same tabs with counts, the same fields per row in a compact layout (class date
    and time, request date and time, student, kind badge, side, status words), and the same filters and
    sort chosen in one "Filtrar/Ordenar" sheet; changing the tab clears the status filter and the chosen sort. Pages load one
    after another as the list scrolls to its end (`page` + 1 until `hasNext` is false), same page size.
13. **Actions stay where they are.** An Em aberto row offers exactly today's actions for its kind and
    status (private `pending`: accept, decline, propose another time; academy `pending`: accept, reject,
    with the below-the-bar confirmation and every refusal shown as today, `classes.join-requests`
    rule 17; `classes.class-requests` rule 4a's clash lines). A Histórico row offers none. After an
    action the row moves sections by the next read.
14. **The table follows every change.** The table's reads refresh on the events that refresh the lists
    today, `@levelup/hooks` `requestEvents` (`class_request_changed`, `join_request_created`,
    `join_requests_superseded`, `join_request_decided`; `classes.class-requests` rule 19,
    `classes.join-requests` rule 17). Web re-reads the current page and keeps tab, sort, filters and
    page. Mobile keeps tab, sort and filters and reloads from page 1, dropping the pages it had appended.
15. **Opening a row shows its detail.** Pressing a row (web) or tapping it (mobile) shows the student's
    note, the request instant, the decision instant and who decided (rule 1's `decidedBy`; "—" when
    null), and, for a weekly private request, its recurrence. Nothing in it is editable.
16. **"Propose another time" from the chat still opens the form.** The coach's request bubble sends them
    to `/class-requests?proposeFor=<id>` (web, `MessageBubble`) or
    `/class-requests?proposeFor=<id>` (iOS, `app/conversation/[id].tsx`; installed builds push
    `/settings?section=classRequests&proposeFor=<id>`, which still lands on the same screen). Today both
    shells find that request in the whole list they hold. The table instead reads that one request
    (`kind=private&id=<id>`, rule 7), whatever page or section it is on, and when it is `pending` opens
    the propose form beside it — under its row, or its card — prefilled with its slot, as today (a request
    that is not on the loaded page opens the form at the top of the list), and scrolls to it. A request that is not pending, or not
    the coach's, opens nothing. The `proposeFor` param is then removed from the route.
17. **Web below 768 px: cards, not a table.** Under the `md` breakpoint the page shows no table: each
    request is a card with the same fields (class day and time, request day and time, student, kind with
    the class title, side, status words), the same actions and the same detail on a tap, under the same
    tabs and the same pager. The filters sit in one collapsible "Filtrar/Ordenar" block that also holds a
    sort select (key and direction), because the headers are gone; its date and time inputs fit the card.
    Everything else — the endpoint, the params, the URL — is the table's.

### Not this spec
- The student's requests list (Availability, web and iOS). It keeps `GET /app/class-requests` +
  `GET /app/class-join-requests` + the waiting list, merged newest first by `@levelup/config`
  `mergeClassRequestRows` / `splitClassRequestRows` (`classes.join-requests` CLASSES-JOIN-REQUESTS-25),
  and its own `proposeFor` for a countered request.
- New statuses: `expired`, "aceite automaticamente", "passada para a lista de espera" (owner, 25 Nov:
  no status added). A `superseded` academy row covers every way a request lost its spot.
- Closing open requests whose class has passed (see Open questions).
- Any change to what an action does, to the chat bubbles, or to the request lifecycle.
- Waiting-list places (`classes.academy-class-booking` rule 11): a student-side row kind only.
- Exporting the table, saved views, bulk actions.
- A database migration (see Open questions).
- Posting the ticket's requested screenshots to Linear (nothing goes to Linear without the owner's word).

### Today
- **Coach screen, web:** `frontend/apps/web/src/pages/ClassRequestsPage.tsx` renders
  `frontend/apps/web/src/components/class-requests/ClassRequestsSection.tsx` (`role="coach"`; the same
  component serves the student's Availability page). It fetches both lists whole
  (`listClassRequests`, `listClassJoinRequests` from `frontend/packages/api/src/resources/classRequests.ts`
  and `classJoinRequests.ts`), merges them client-side with `mergeClassRequestRows` (by `createdAt`
  descending) and splits them with `splitClassRequestRows` / `isOpenClassRequestRow`
  (`frontend/packages/config/src/class-request-list.ts`: private open = `PRIVATE_OPEN_STATUSES`
  {pending, countered}; academy open = pending; waiting list open = active). Open rows render as rows;
  closed ones inside a `<details>` "Histórico (n)" (`class-requests-history-toggle`). Rows show the
  student, the class date and time, the note, the side (academy), a status badge from
  `classRequests.coachStatus.<status>` (lines 249, 360) and actions; neither shows `createdAt` or
  `decidedAt`. No sort, filter, search or paging. `?proposeFor=<id>` (lines 141–154) finds the request
  in the whole list and opens the coach's propose form on a pending one.
- **Coach screen, mobile:** `frontend/apps/mobile/src/features/class-requests/class-requests-section.tsx`,
  rendered inside `app/settings.tsx`'s `ScrollView` as a settings section; the same merge/split helpers,
  a `showClosed` toggle (`class-requests-history-toggle`), the same `coachStatus` keys (lines 201, 294),
  and `proposeFor` handled on the whole list (lines 94–101). The conversation screen pushes
  `/settings?section=classRequests&proposeFor=<id>` for the coach (`app/conversation/[id].tsx` ~1272).
- **Status words:** `frontend/src/locales/{pt,en}/classRequests.json` `coachStatus`: pending "À tua
  espera", countered "À espera do aluno", accepted "Marcada", declined "Recusado", withdrawn "Retirado
  pelo aluno", rejected "Recusado", superseded "Vaga ocupada" (en: Waiting for you, Waiting for the
  student, Booked, Declined, Withdrawn by the student, Declined, Spot taken). Also read by the academy
  request bubble (`MessageBubble.tsx` ~918, mobile `message-bubble.tsx` ~1069). Nothing says a student
  declined a proposal.
- **Backend:** `GET /app/class-requests` (`backend/padel_app/modules/frontend_api.py`,
  `class_request_service.list_requests_for`: coach or student scope, `id` descending, unpaginated,
  `serialize_class_request` lazy-loads `player.user`, `coach.user` and invitees per row).
  `GET /app/class-join-requests` (`class_join_request_service.list_join_requests_for`: `created_at`
  descending then `id`, unpaginated; `serialize_join_request_list_row` lazy-loads the instance, the
  player and an `Association_CoachPlayer` row per row). `decided_by_coach_id` is not serialized. Both
  serialize `createdAt` / `decidedAt` with a bare `.isoformat()` (no offset); `utils/dates.to_utc_iso`
  exists for that.
- **Statuses:** `backend/padel_app/models/class_request.py` enum `class_request_status` (pending,
  countered, accepted, declined, withdrawn; `decided_by` enum coach | student);
  `backend/padel_app/models/class_join_request.py` enum `class_join_request_status` (pending, accepted,
  rejected, withdrawn, superseded). `superseded` is written when the spot filled, the class turned out
  closed or full at accept time, or the request moved to its side's waiting list
  (`class_join_request_service.py`). The automatic accept (`classes.join-requests` rule 21) goes through
  the same accept and sets `decided_by_coach_id`, so it cannot be told apart from a manual accept.
- **Sides:** a join request's `side` is `left`, `right`, `both` or null (`SIDES`, `requested_side`,
  `class_join_request_service.py` ~117–129).
- **Expiry:** no code closes an open request when its class passes. A private request whose slot has
  passed stays `pending` or `countered`; an academy request still `pending` when its class starts stays
  `pending` (`classes.join-requests` rule 14 says such requests are closed, but only a later accept
  closes one, as `superseded` with `class_closed`; nothing runs at the start). Whether cancelling a class
  closes its pending requests is not read in the code.
- **Clocks:** `class_requests.created_at` comes from the base model (`backend/padel_app/model.py`,
  `utcnow_naive`, nullable); `class_join_requests.created_at` is set from `utcnow_naive()`. Both are
  UTC. Whether any private row has `created_at` null in prod is not read in the data.
- **Indexes:** `class_requests`: `coach_id`, `player_id`, `start_datetime`. `class_join_requests`:
  `coach_id`, `player_id`, `lesson_instance_id`, and a partial unique on pending rows.
  `lesson_instances.start_datetime` is indexed.
- **Paging convention:** `GET /app/coach_players_paginated` (`players.list` rule 2): `page` (int,
  below 1 read as 1), `per_page` (default 25, clamped 1..100), `sort_by`, `sort_dir`; response
  `{items, pagination: {page, perPage, total, pages, hasNext, hasPrev}, …}`
  (`player_service.get_coach_players_paginated`).
- **Name search:** `player_service.rank_player_match` / `name_matches_query` and `@levelup/config`
  `nameMatchesQuery` (`players.search`, folding in Python, no `unaccent` in prod). Its typo tier makes
  `joao` match "Joana Silva" (run in the backend venv, 25 Nov). `players.search` rule 8 lists the
  surfaces that use it; the owner added "Pedidos de Aula" on 26 Nov 2026.
- **Statement counting precedent:** `backend/padel_app/tests/test_pad204_conversation_list_perf.py`
  `_statement_counter` counts every cursor statement of the whole request, authentication included, and
  compares a small and a large case.
- **Pinned by:** `frontend/packages/config/src/class-request-list.test.ts`;
  `ClassRequestsSection.joinRequests.test.tsx` (CLASSES-JOIN-REQUESTS-15, -17), `.busySameHour`,
  `.nickname`, `.propose`, `.waitingList` tests in the same folder;
  `class-requests-section.nickname.test.tsx`, `.propose.test.tsx` on mobile;
  `backend/padel_app/tests/test_pad460_join_request_lists.py` (CLASSES-JOIN-REQUESTS-24).
  Web E2E that open the coach's `/class-requests` (grep `class-requests` in `frontend/apps/web/e2e`):
  `class-requests/class-request-booking`, `class-request-counter-proposal`,
  `pad282-cancel-requested-class`, `pad488-calendar-follows-request`,
  `schedule-calendar/pad372-hold-occurrence-locked`, `attendance/pad288-early-cancellation`,
  `pad551-side-per-occurrence`, `pad567-clear-mark`, `pad570-vou-after-reminder` (`.spec.ts`).
  Maestro: `111-coach-accepts-academy-request-from-list` opens the coach's Pedidos de Aula
  (`settings-nav-classRequests`, `class-requests-history-toggle`); `144-waiting-list-in-request-history`
  drives the student's list (CLASSES-COACH-REQUESTS-TABLE-20). Flows 67 and 230 only call the
  class-request API and never open the list.

### Acceptance Criteria

#### CLASSES-COACH-REQUESTS-TABLE-1: One list holds both kinds of the calling coach's requests, and only a coach reads it (rule 1)
- **Given** coach Ana with a private request from Bruno (Ana calls him "Bruninho") and academy requests from Carla (side `left`) and Diana (side `both`), and coach Rui with one request of each kind
- **When** Ana GETs `/api/app/coach-requests?section=open`
- **Then** she gets exactly her three rows, each with every rule 1 field: Bruno's with `side: null`, `playerName` "Bruno …", `nickname` "Bruninho" and `displayName` per `nickname_payload`; Carla's with `side: left` and `classTitle`; Diana's with `side: both`
- **And** `createdAt` and `decidedAt` end in an explicit UTC offset, and a student or a user with no coach profile gets `403`
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_lists_both_kinds_of_the_coachs_requests_only`

#### CLASSES-COACH-REQUESTS-TABLE-2: Each status lands in exactly one section, by the shared open-status constants (rules 2, 3)
- **Given** one private request in each of its five statuses and one academy request in each of its five statuses, all Ana's
- **When** Ana reads `section=open`, `section=history`, no `section`, and `section=closed`
- **Then** Em aberto holds exactly the rows whose status is in const:PRIVATE_REQUEST_OPEN_STATUSES (private) or const:JOIN_REQUEST_OPEN_STATUSES (academy), Histórico holds the other seven, and no row is in both or neither
- **And** `counts` is `{open: 3, history: 7}` on both reads, no `section` reads as `open`, and `section=closed` answers `400 invalid_filter` with `field: "section"`
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_each_status_is_in_exactly_one_section`

#### CLASSES-COACH-REQUESTS-TABLE-3: The server's split and the client helper's split read the same constants (rule 3)
- **Given** the open-status constants
- **When** the backend's section split and `@levelup/config` `isOpenClassRequestRow` classify every (kind, status) pair of rule 2
- **Then** both give the same answer for every pair, and both equal the constants' lists
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_open_statuses_match_the_constants`; `frontend/packages/config/src/class-request-list.test.ts` › `[CLASSES-COACH-REQUESTS-TABLE-3] open statuses match the constants`

#### CLASSES-COACH-REQUESTS-TABLE-4: Pages cover a section exactly once across both kinds (rule 4)
- **Given** Ana with 30 open private and 30 open academy requests at interleaved class times
- **When** she reads `section=open` page 1, 2 and 3 without `per_page`
- **Then** `items` on pages 1 and 2 hold const:COACH_REQUESTS_PAGE_SIZE rows, page 3 holds the rest, `pagination.total` is 60, `pages`, `hasNext` and `hasPrev` agree, and the three pages together list each of the 60 rows once, in rule 6's order
- **And** `per_page=500` is served as const:COACH_REQUESTS_MAX_PAGE_SIZE; `page=0` and `page=abc` are served as page 1; page 99 is an empty `items` with `total` 60
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_pages_cover_the_section_once_across_both_kinds`

#### CLASSES-COACH-REQUESTS-TABLE-5: Em aberto opens on the nearest class, Histórico on the newest request (rule 6)
- **Given** open requests for classes on 3 Dec, 1 Dec and 2 Dec (made in another order) and closed requests made on 20, 22 and 21 Nov
- **When** Ana reads each section with no `sort_by`
- **Then** Em aberto lists 1, 2, 3 Dec, and Histórico lists the 22, 21, 20 Nov requests
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_default_orders_per_section`

#### CLASSES-COACH-REQUESTS-TABLE-6: Every sort key orders both directions, nulls the same on both databases, and keeps one tie-break (rule 5)
- **Given** a fixture of both kinds that differs on every sort key — sides `left`, `right`, `both` and none; students sorted differently by real name and by nickname; a private row with `created_at` null — with two rows equal on each key
- **When** Ana reads with each `sort_by` of rule 5, `asc` then `desc`
- **Then** each order is the key's order (`side` asc: left, right, both, none; `student` by `displayName`), `desc` is the reverse of `asc` apart from the tie-break, rows equal on the key follow the tie-break (request instant descending, kind ascending, id descending), `class_time` orders by time of day, not by date, and the null-`created_at` row is first in `requested_at asc` and last in `requested_at desc`
- **And** the same reads give the same orders on the Postgres lane as on SQLite
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_every_sort_key_both_directions`

#### CLASSES-COACH-REQUESTS-TABLE-7: Filters narrow the rows and the counts before the page is cut (rules 3, 7)
- **Given** a fixture of both kinds, sides `left`, `right`, `both` and none, statuses, students, class dates and times, and request instants around a club-local midnight in summer time
- **When** Ana reads with each filter of rule 7 except `search` alone, and with kind + status + class date range together
- **Then** each read returns exactly the rows the filter describes and `pagination.total` and the requested section's count count only them; with a `status` filter the other section's count applies the other filters but not the status
- **And** a request made at 00:30 Lisbon time on 2 Jul (23:30 UTC on 1 Jul) is out of `requested_from=2026-07-01&requested_to=2026-07-01` and in the same read for 2 Jul; `side=both` returns only Diana-like rows; `side=none` returns every private row; a status of the other section returns nothing; `kind=private&id=<n>` returns that one request in either section; and `class_to=not-a-date` answers `400 invalid_filter`
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_each_filter_narrows_rows_and_counts`

#### CLASSES-COACH-REQUESTS-TABLE-8: The name search is the players search (rule 7)
- **Given** requests from "João Sousa", "Joana Silva", "Pedro Mesquita e Sousa" and "Rita Gomes", whom Ana calls "Ritinha"
- **When** Ana searches `joao`, then `pedro sousa`, then `ritinha`, then `%`
- **Then** `joao` finds João Sousa and Joana Silva (the typo tier) and not the others; `pedro sousa` finds Pedro Mesquita e Sousa only; `ritinha` finds Rita Gomes; `%` finds nobody — each the set `player_service.rank_player_match` over `{name, nickname}` accepts for those names
- **And** the rows keep the table's sort, not the match tiers
- **And** a search joins the other filters: `ritinha` with `kind=private` returns her private requests only, and the counts of both sections count only her requests; a search never returns another coach's request
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_search_matches_like_the_players_search`

#### CLASSES-COACH-REQUESTS-TABLE-9: A request's statement count does not grow with the coach's requests or the page's rows (rule 8)
- **Given** Ana with 10 requests, then with 600 (both kinds, with invitees, sides, nicknames and notes)
- **When** she reads page 1 with `per_page` = const:COACH_REQUESTS_MAX_PAGE_SIZE, with a `search`, a `status` and a `kind` filter on (and once with `player_id`), counting every statement at the cursor for the whole request after one warm-up request
- **Then** the 600-request read issues exactly as many statements as the 10-request read, and neither issues more than const:COACH_REQUESTS_QUERY_BUDGET
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_statement_count_does_not_grow`

#### CLASSES-COACH-REQUESTS-TABLE-10: The old list endpoints answer as before (rule 9; CLASSES-JOIN-REQUESTS-24)
- **Given** Ana's requests of both kinds
- **When** Ana and a student GET `/api/app/class-requests` and `/api/app/class-join-requests`
- **Then** the rows, their order and their fields are those `classes.class-requests` rule 9 and `classes.join-requests` rule 17 describe, with no paging fields, and the CLASSES-JOIN-REQUESTS-24 tests in `backend/padel_app/tests/test_pad460_join_request_lists.py` pass unchanged
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_old_list_endpoints_unchanged`

#### CLASSES-COACH-REQUESTS-TABLE-11: The table names each status with the coach-side keys the list and the bubbles use (rule 10)
- **Given** every (kind, status, decidedBy) of rule 2
- **When** `coachRequestStatusKey` maps it
- **Then** every pair maps to `classRequests.coachStatus.<status>`, except a private `declined` with decidedBy `student`, which maps to `classRequests.coachStatus.declinedByStudent`; every key resolves in pt and en, and none falls back to the raw status
test: `frontend/packages/config/src/class-request-status-key.test.ts` › `[CLASSES-COACH-REQUESTS-TABLE-11] every status maps to an existing coach-side key`

#### CLASSES-COACH-REQUESTS-TABLE-12: The web table shows two tabs with counts and the eight fields in order (rules 11, 1)
- **Given** the endpoint answers an open page with one private row and academy rows of side `left` and `both`, and `counts {open: 3, history: 5}`
- **When** the coach opens `/class-requests`
- **Then** "Em aberto (3)" is selected and "Histórico (5)" is beside it, the header reads the columns of rule 11 in order (the Aula and Pedido columns each with a day and a time control) plus actions, and each row's cells show its class day and time, request day and time in the club's time zone in the language's short date format, `displayName`, kind, side (the app's existing words for `left` and `both`, "—" for the private row) and rule 10's words
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-12] tabs with counts and the eight columns`

#### CLASSES-COACH-REQUESTS-TABLE-13: Sorting, filtering and switching tabs on web send the params, go back to page 1, and a tab change drops the status filter and the sort (rules 5, 6, 7, 11)
- **Given** the coach on Histórico page 3 with a status filter `accepted`
- **When** they press "Aluno", press it again, set kind Privada and a class date range, switch to Em aberto, then press "Limpar filtros"
- **Then** each step requests the endpoint with the matching `sort_by`/`sort_dir`/filter params and `page=1`; after the tab switch the request carries no `status` and no `sort_by` (the tab's own default order applies); the URL query carries the same state, and a reload of that URL requests the same page
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-13] sort, filters and tab reset the page and live in the URL`

#### CLASSES-COACH-REQUESTS-TABLE-14: The web pager walks the pages (rules 4, 11)
- **Given** an answer with `pagination {page: 1, pages: 3, hasNext: true, hasPrev: false}`
- **When** the coach presses next twice, then previous
- **Then** pages 2, 3 and 2 are requested, the pager reads "2 / 3", next is disabled on page 3 and previous on page 1
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-14] the pager walks the pages`

#### CLASSES-COACH-REQUESTS-TABLE-15: Em aberto rows keep today's actions; Histórico rows have none (rule 13)
- **Given** an open private `pending` row, an open private `countered` row, an open academy `pending` row for a student below the bar, and a Histórico row
- **When** the coach looks at each and accepts the academy row
- **Then** the private pending row offers accept, decline and propose another time; the countered row offers none of them; the academy row offers accept and reject, and its accept asks the below-the-bar confirmation before sending `{confirm: true}`; the Histórico row offers nothing — on web and on mobile
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none`; `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none`

#### CLASSES-COACH-REQUESTS-TABLE-16: The table refreshes on every request event (rule 14)
- **Given** the coach on Histórico, sorted by student, filtered to academy, on page 2 (web) or with two pages appended (mobile)
- **When** each of `class_request_changed`, `join_request_created`, `join_requests_superseded` and `join_request_decided` arrives
- **Then** web reads the endpoint again with the same section, sort, filters and `page=2`; mobile reads it again with the same section, sort and filters from `page=1` and shows only that page until the list is scrolled again
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-16] refreshes on request events and keeps the view`; `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-16] refreshes from page 1 on request events and keeps tab, sort and filters`

#### CLASSES-COACH-REQUESTS-TABLE-17: A row opens its detail (rule 15)
- **Given** a private request declined by the student with a note, an academy request with `decidedBy` null, and a weekly private request
- **When** the coach opens each
- **Then** the detail shows the note, the request instant and the decision instant in the club's time zone, "Aluno" / "—" as the decider, and the weekly request's weekdays and end date — on web and on mobile
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-17] a row opens its detail`; `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-17] a row opens its detail`

#### CLASSES-COACH-REQUESTS-TABLE-18: Mobile opens Pedidos de Aula as its own screen with compact rows of the same fields and tabs (rule 12)
- **Given** the endpoint answers as in CLASSES-COACH-REQUESTS-TABLE-12
- **When** the coach presses `settings-nav-classRequests` on iOS
- **Then** a screen of its own opens (not a section inside the Settings scroll view), the two tabs show the same counts, and each compact row shows class date and time, request date and time, `displayName`, kind badge, side and rule 10's words
test: `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-18] its own screen with compact rows carrying the table's fields`

#### CLASSES-COACH-REQUESTS-TABLE-19: Mobile's "Filtrar/Ordenar" sheet sends the web's params, a tab change drops the status filter and the sort, and the list loads the next page at its end (rules 5, 6, 7, 12)
- **Given** an answer with `hasNext: true`
- **When** the coach scrolls to the end, then opens "Filtrar/Ordenar", picks sort by student descending, kind Academia, status Marcada and a student, applies, then switches tab
- **Then** page 2 is requested and appended; after applying, page 1 is requested with the same `sort_by`/`sort_dir`/filter params the web sends for the same choices; after the tab switch page 1 is requested without `status` and without `sort_by`; no further page is requested once `hasNext` is false
test: `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-19] the sheet sends the web's params and pages load at the end`

#### CLASSES-COACH-REQUESTS-TABLE-20: The student's list is untouched (Not this spec)
- **Given** a student with a pending private request, a decided academy request and a waiting-list place
- **When** she opens her requests in Availability on web and on iOS
- **Then** she sees today's merged newest-first list with its open part and its "Histórico" toggle, read from the two old endpoints and the waiting list, and the coach endpoint is never called
test: `frontend/apps/web/src/components/class-requests/ClassRequestsSection.joinRequests.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads`; `frontend/apps/mobile/src/features/class-requests/class-requests-section.student.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads`

#### CLASSES-COACH-REQUESTS-TABLE-21: "Propose another time" from the chat opens the form on that request wherever it pages (rule 16)
- **Given** Ana with 60 open requests, and Bruno's pending private request on what would be page 3 of Em aberto
- **When** Ana follows her bubble's "Propose another time" — web `/class-requests?proposeFor=<id>`, iOS `/class-requests?proposeFor=<id>` (installed builds: `/settings?section=classRequests&proposeFor=<id>`)
- **Then** the table reads `kind=private&id=<id>`, opens the propose form on Bruno's request prefilled with its date, start and end, and removes `proposeFor` from the route; on iOS both routes land on the Pedidos de Aula screen
- **And** the same link for a request that is `countered`, decided, or another coach's opens no form
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-21] proposeFor opens the form on a request on any page`; `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-21] proposeFor from settings lands on the screen and opens the form`

#### CLASSES-COACH-REQUESTS-TABLE-22: Below 768 px the web page shows cards with the same fields, actions, tabs, filters and pager (rule 17)
- **Given** the endpoint answers an open page with a private row and an academy row of side `left`, and the browser is 390 px wide
- **When** the coach opens `/class-requests`, opens "Filtrar/Ordenar", picks sort by student descending and kind Academia, and presses a card
- **Then** no table is in the page; each request is a card showing its class day and time, request day and time, `displayName`, kind, side and rule 10's words, with Aceitar and the other actions of its kind; the request sent carries `sort_by=student`, `sort_dir=desc`, `kind=academy` and `page=1`; the card opens its detail; "Em aberto (n)", "Histórico (n)" and the pager are the table's
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.narrow.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-22] below 768 px cards carry the table's fields, actions, sort and filters`

#### CLASSES-COACH-REQUESTS-TABLE-23: The search box waits for the typing to stop, sends `search`, goes back to page 1 and says when nobody matches (rules 7, 11; `players.search` rule 10)
- **Given** the coach on page 2 of Em aberto, with the sort by student descending and `kind=private` on
- **When** she types `rit` letter by letter, faster than 200 ms apart, then waits
- **Then** one request goes out, 200 ms after the last letter, carrying `search=rit`, `page=1`, the sort and the kind, and `search` is in the URL on web; while it is in flight `player-search-searching` shows and the previous rows stay
- **And** when the answer has no rows, `player-search-empty` reads "Nenhum jogador encontrado para «rit»" in place of the table's own empty line; clearing the box removes `search` from the request and the URL; changing the tab keeps the text and sends it with the other section; "Limpar filtros" clears it
- **And** below 768 px on web, and in iOS's "Filtrar/Ordenar" sheet, the box is the first control of the filters, with the same behaviour
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.search.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-23] the search box debounces, resets the page and says when nobody matches`; `frontend/apps/mobile/src/features/class-requests/coach-requests-screen.search.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-23] the search box debounces, resets the page and says when nobody matches`

### Performance
A coach with thousands of requests reads one page in a bounded, constant number of statements
(CLASSES-COACH-REQUESTS-TABLE-9). const:COACH_REQUESTS_QUERY_BUDGET is set from the statements one
request needs at most, counted as rule 8 counts them (the 10-vs-600 test counts them at the cursor):
authentication and the coach (4: the token check, the user twice, the coach), the two section counts
(2; the requested section's count is also the page's total), the page's rows (1), and six batch loads —
the private rows, the academy rows, students and their users, the coach's relation rows, lesson
instances with their classes, and invitees (6): 13. The club's time zone is one constant
(`utils/dates.CLUB_TZ`), so the request-date bounds cost no statement. `search` (rule 7) adds the
requesters read (1), only for a non-blank value: 14, so the constant is 14 since PAD-795b. It is a hard bound:
raising it is an amendment of the constant with a reason. Before the PR merges, the build also times the
endpoint on a staging copy shaped like the busiest coach (each section, default sort, a search and a
filter) and writes the timings in the PR; a page over 300 ms server time there reopens the index
question below. That timing checks the build; the statement bound is what holds forever.

### Waves
1. **Backend list shape.** `constants.md`; CLASSES-COACH-REQUESTS-TABLE-1, -2, -3 (backend half), -4,
   -5, -6, -7, -9, -10 — `GET /app/coach-requests`, a new service beside `class_request_service` /
   `class_join_request_service`, batch-loading serializers; `@levelup/api` resource and types.
   CLASSES-COACH-REQUESTS-TABLE-8 (`search`) was built after the merge (PAD-795b, once the owner
   answered the search-surface question), with the clients' search box; the picker over the coach's
   students that stood in for it is gone.
2. **Web.** CLASSES-COACH-REQUESTS-TABLE-3 (client half), -11, -12, -13, -14, -15 (web), -16 (web),
   -17 (web), -20 (web), -21 (web) — `@levelup/config` `coachRequestStatusKey` and the open-status
   constants, the `declinedByStudent` key in pt and en, `CoachRequestsTable` on `ClassRequestsPage`,
   row actions reused from `ClassRequestsSection`; the amended CLASSES-JOIN-REQUESTS-15 test moves to
   the table; the nine web E2E specs under Today that open the coach's `/class-requests` are re-run and
   updated where they find a row in the old list.
3. **Mobile.** CLASSES-COACH-REQUESTS-TABLE-15 (mobile), -16 (mobile), -17 (mobile), -18, -19,
   -20 (mobile), -21 (mobile) — the coach's Pedidos de Aula screen on Expo (out of `app/settings.tsx`),
   the `section=classRequests` redirect, the "Filtrar/Ordenar" sheet, pt/en strings imported statically
   (`frontend/CLAUDE.md`'s mobile i18n trap); Maestro flow 111 updated for the screen and the tabs.
Web and mobile ship in the same PR (owner: "web and iOS together, own PR").

### Open questions
**For the owner:**
- **Answered by the owner, 26 Nov 2026 (via the orchestrator):** the requests table IS a search surface
  (`players.search` rule 8 now lists it; `search` is rule 7's, CLASSES-COACH-REQUESTS-TABLE-8); a
  `countered` request stays in Em aberto, labelled "À espera do aluno"; and the wording
  `coachStatus.declinedByStudent` stays, pt "Recusado pelo aluno", en "Declined by the student". Every
  other status keeps its words.

**Decided in this run (reversible at review):**
- **Migration / index: no.** Both tables already index `coach_id`; a coach's requests number in the
  hundreds to low thousands, which the database sorts in memory per read, and the booking stream plan
  (13 Nov) needed a migration only for an `expired` status, which the owner ruled out. The performance
  check above reopens this (a `(coach_id, created_at)` index on each table) if a page is slow on staging
  data. — decided by me.
- **Open requests whose class has passed stay in Em aberto.** No code closes them (Today, Expiry): a
  private request whose slot passed stays `pending` or `countered`, and an academy request whose class
  started stays `pending`. Under Em aberto's default order they sort to the top. Options: (a) show them
  as they are; (b) hide or relabel them (a derived `expired`, which the owner ruled out); (c) a job that
  closes them (a lifecycle change, its own ticket; for academy requests it is what `classes.join-requests`
  rule 14 already says). Decision: (a); the gap between rule 14 and the code is reported, not fixed
  here. — decided by me.
- **Page size 25, max 100, and the roster's response shape** (`{items, pagination, …}`, bad `page`
  read as 1). The plan asked "how many per page" without a pick. — decided by me.
- **Default order: Em aberto by nearest class, Histórico by newest request.** From the ticket's own "A
  definir" list; the owner's words do not override it. — lead's pick, reversible.
- **"Pedido: hora" sorts by the request instant and has no time-of-day filter; "Aula: hora" sorts and
  filters by time of day.** The request instant is stored in UTC, and its club-local time of day needs a
  per-row timezone conversion SQL cannot do portably (SQLite tests, Postgres prod); the class time is
  stored as wall clock and can. — decided by me.
- **Search mechanism:** match in Python over the coach's distinct requesters with
  `rank_player_match` over name and nickname, then an SQL `IN`; folding all rows in Python would defeat
  SQL paging. — decided by me.
- **The student column sorts by `displayName`** (the nickname when the coach shows it as the name),
  because that is what the column shows (`players.nickname` rule 9). — decided by me.
- **Status sort uses a fixed order (const:COACH_REQUESTS_STATUS_ORDER), not the words' alphabet**, so pt
  and en sort alike. — decided by me.
- **A null request instant counts as the earliest**, explicitly on both databases, so Histórico's
  newest-first never opens on old rows with no instant. — decided by me.
- **A status filter belongs to its tab**: cleared on a tab change; the other tab's count ignores it. —
  decided by me.
- **Row detail (rule 15).** The ticket lists it under "A definir"; the owner's words did not rule on it.
  Kept because the data exists and it costs one panel. "Who decided" for an academy row is "Treinador" or
  "—": an automatic accept (rule 21) writes the coach as decider, so it cannot be told apart. — lead's
  pick, reversible.
- **Mobile: Pedidos de Aula becomes its own screen**, because a paged list that loads at its end cannot
  live inside Settings' `ScrollView`; the `section=classRequests` (+ `proposeFor`) route installed
  builds' bubbles push keeps working by landing on it. After a refresh event mobile reloads from page 1
  (appended pages would otherwise go stale); web keeps its page. — lead's pick, reversible.
- **`proposeFor` reads the one request by id** (`kind=private&id=<id>`) instead of searching the loaded
  page, because the request may be on any page. — decided by me.
- **Coach-only endpoint, new route `GET /app/coach-requests`,** rather than paging the two old
  endpoints: installed iOS builds read those, and one sorted page across two tables needs one query. —
  decided by me.
- **The statement budget counts the whole request, authentication included**, as the PAD-204 test does,
  so the number in the constant is the number the test sees. — decided by me.
- **`serves: P-CLASSES-4`.** The table serves both P-CLASSES-3 (private requests) and P-CLASSES-4
  (academy requests); the frontmatter takes one, and P-CLASSES-4 is the promise that names "Pedidos de
  Aula". — decided by me.
- **The URL keeps the table's state on web (rule 11); mobile keeps it in the screen's state only.** —
  decided by me.
- **This spec touches two others.** `classes.join-requests` rule 17 and CLASSES-JOIN-REQUESTS-15
  (the coach's list order) and `classes.class-requests` rule 9 (which list reads which endpoint) were
  amended with it; no rule, Not-this-spec line or recorded owner decision is changed by this spec.
  `players.search` rule 8 is amended with it (PAD-795b, the owner's answer above).
