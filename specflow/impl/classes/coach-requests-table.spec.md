---
id: classes.coach-requests-table
status: draft
depends_on: [classes.class-requests, classes.join-requests, players.search, players.list]
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
  and its LessonInstance (`classes.join-requests`), the student's display name (`players.search`,
  `player_service.coach_display_name`).

### Rules
1. **One list, two kinds, the coach's only.** `GET /app/coach-requests` returns the caller's private
   class requests (`class_requests.coach_id`) and academy join requests (`class_join_requests.coach_id`)
   as one list. It is coach-only: a caller with no coach profile gets `403` before any query runs
   (`players.list` rule 7's pattern, `require_coach()`). Students keep their own list (Not this spec).
   Each row carries:
   - `kind` (`private` | `academy`) and `id` (unique within its kind; the pair is the row's key);
   - `playerId`, `playerName` (the coach's display name for the student, as both lists show today);
   - `date`, `startTime`, `endTime`: the class's club-local wall clock. A private request's is its
     slot on the table (`start_datetime`/`end_datetime`; for a weekly request, its first occurrence);
     an academy request's is its `LessonInstance`'s;
   - `classTitle` (academy only, else null), `recurrence` (private only, as today);
   - `createdAt` (the request instant, UTC, ISO), `decidedAt`, `decidedBy` (private: `coach` |
     `student`; academy: `coach` when `decided_by_coach_id` is set, else null), `note`, `status`,
     `side` (academy: `left` | `right` | null; private: always null — private requests have no side);
   - every field today's row actions read (private: `participants`, `lessonId`, `coachId`; academy:
     `lessonInstanceId`, `suggestedProfileSide`), so the row's actions work from this row alone.
2. **The statuses are the ones that exist today; none is added.** Private: `pending`, `countered`,
   `accepted`, `declined`, `withdrawn`. Academy: `pending`, `accepted`, `rejected`, `withdrawn`,
   `superseded`. There is no `expired` status and no "accepted automatically" marker; neither is derived.
3. **Em aberto and Histórico.** `section=open` holds a private row whose status is in
   const:PRIVATE_REQUEST_OPEN_STATUSES and an academy row whose status is in
   const:JOIN_REQUEST_OPEN_STATUSES; `section=history` holds every other row. Every row is in exactly
   one section. This is the split `@levelup/config` `isOpenClassRequestRow` makes today, and both read
   the same constants. The response carries both sections' totals under the active filters
   (`counts: {open, history}`), so each tab shows its number.
4. **Server-side pages.** Params `page` (1-based, default 1) and `per_page` (default
   const:COACH_REQUESTS_PAGE_SIZE, clamped to 1..const:COACH_REQUESTS_MAX_PAGE_SIZE). The response
   is `{rows, page, perPage, total, pages, hasNext, counts}`, the roster's paging fields
   (`players.list` rule 2). Filters and sort apply across both kinds before the page is cut, so the
   pages of one section, read in order, list each of its rows exactly once. A page past the end is an
   empty `rows` with the true `total`, never an error.
5. **Sort.** `sort_by` ∈ `class_date`, `class_time`, `requested_at`, `student`, `kind`, `side`,
   `status`; `sort_dir` ∈ `asc`, `desc`.
   - `class_date`: the class start instant (date then time).
   - `class_time`: the class's time of day (wall clock), then the class date.
   - `requested_at`: the request instant; the "Pedido: dia" and "Pedido: hora" columns both sort by it.
   - `student`: the display name, case-insensitive.
   - `kind`: `academy` before `private` ascending.
   - `side`: `left`, `right`, then rows with no side, ascending.
   - `status`: by const:COACH_REQUESTS_STATUS_ORDER.
   Every sort ends with the same tie-break: request instant descending, then `kind`, then `id`
   descending, so a page boundary never repeats or skips a row. A missing or unknown `sort_by` uses the
   section's default. A private row with no request instant (`created_at` is nullable) sorts last in
   both directions of `requested_at` and is never matched by `requested_from` / `requested_to`.
6. **Default order (from the ticket).** Em aberto: `class_date` ascending — the request for the nearest
   class first. Histórico: `requested_at` descending — the newest request first.
7. **Filters, all ANDed, all optional.**
   - `kind=private|academy`;
   - `status=<s>[,<s>…]`, only statuses of the requested section (others match nothing);
   - `side=left|right|none` (`none` = no side, which includes every private row);
   - `class_from`, `class_to` (club-local `YYYY-MM-DD`, inclusive) on the class date;
   - `class_time_from`, `class_time_to` (`HH:MM`, inclusive) on the class's time of day;
   - `requested_from`, `requested_to` (club-local `YYYY-MM-DD`, inclusive) on the request instant,
     whose day bounds are the club-local day's boundaries turned into UTC (`club-local-day-boundary`);
   - `player_id=<id>`: one student;
   - `search=<text>`: the student's name, matched by `players.search`'s one rule
     (`player_service.name_matches_query`, folding B-531): the server folds and matches over the
     coach's distinct requesters (a set the size of the coach's students, not of their requests),
     then filters the rows by those player ids in SQL, before the page is cut.
   A malformed value answers `400 {code: "invalid_filter", field}`; it never silently widens the list.
8. **A page costs the same whatever the coach's history.** One page issues at most
   const:COACH_REQUESTS_QUERY_BUDGET SQL statements, for any page size up to the maximum and any
   number of requests the coach has: the rows are selected, sorted and cut in SQL across both tables,
   and the page's students, classes and coach-side profile data are loaded in batches, never one query
   per row (today's serializers lazy-load per row).
9. **The old list endpoints are unchanged.** `GET /app/class-requests` (`classes.class-requests` rule 9)
   and `GET /app/class-join-requests` (`classes.join-requests` rule 17) keep their rows, order and
   shape: the student's list and installed builds that predate this spec read them.
10. **Status labels come from one function.** `@levelup/config` `classRequestStatusLabel(kind, status,
    decidedBy)` gives each status its words, pt and en, on both shells. **Proposed copy, for the owner's
    approval:**

    | kind | status | pt | en |
    |---|---|---|---|
    | both | `pending` | Pendente | Pending |
    | private | `countered` | Proposta enviada ao aluno | Proposal sent to the student |
    | both | `accepted` | Marcada | Booked |
    | private | `declined`, decidedBy `coach` | Recusada | Declined |
    | private | `declined`, decidedBy `student` | Recusada pelo aluno | Declined by the student |
    | academy | `rejected` | Recusada | Declined |
    | both | `withdrawn` | Retirada pelo aluno | Withdrawn by the student |
    | academy | `superseded` | Sem vaga | No spot left |

    The status filter lists the same words.
11. **Web: a table.** The coach's page shows two tabs, "Em aberto (n)" and "Histórico (n)" (`counts`),
    Em aberto selected on arrival. The table's columns, in this order: Aula: dia · Aula: hora · Pedido:
    dia · Pedido: hora · Aluno · Tipo de aula (Academia / Privada) · Lado preferencial (Esquerda /
    Direita / —) · Estado, plus an actions column in Em aberto. Every column header sorts (rule 5's key
    for that column); pressing the active header flips the direction. Filters sit above the table: a
    student search box, kind, status (the section's statuses), side, a class date range, a class time
    range and a request date range, with one "Limpar filtros". Changing a sort, a filter or the tab
    returns to page 1. A pager under the table shows the page, the page count and previous/next.
    Sort, filters, tab and page live in the URL query, so a reload or a shared link reopens the same
    view.
12. **Mobile: compact rows.** The same endpoint, the same tabs with counts, the same fields per row in
    a compact layout (class date and time, request date and time, student, kind badge, side, status
    label), the same filters and sort chosen in one "Filtrar/Ordenar" sheet. Pages load one after
    another as the list scrolls to its end (`page` + 1 until `hasNext` is false), same page size.
13. **Actions stay where they are.** An Em aberto row offers exactly today's actions for its kind and
    status (private `pending`: accept, decline, propose another time; academy `pending`: accept, reject,
    with the below-the-bar confirmation and every refusal shown as today, `classes.join-requests`
    rule 17; `classes.class-requests` rule 4a's clash lines). A Histórico row offers none. After an
    action the row moves sections by the next read.
14. **The table follows every change.** The table's reads refresh on the events that refresh the lists
    today (`class_request_changed`, `join_request_created`, `join_requests_superseded`, and a decision;
    `classes.class-requests` rule 19, `classes.join-requests` rule 17), keeping the current tab, sort,
    filters and page.
15. **Opening a row shows its detail.** Pressing a row (web) or tapping it (mobile) shows the student's
    note, the request instant, the decision instant and who decided (rule 1's `decidedBy`; "—" when
    null), and, for a weekly private request, its recurrence. Nothing in it is editable.

### Not this spec
- The student's requests list (Availability, web and iOS). It keeps `GET /app/class-requests` +
  `GET /app/class-join-requests` + the waiting list, merged newest first by `@levelup/config`
  `mergeClassRequestRows` / `splitClassRequestRows` (`classes.join-requests` CLASSES-JOIN-REQUESTS-25).
- New statuses: `expired`, "aceite automaticamente", "passada para a lista de espera" (owner, 25 Nov:
  no status added). A `superseded` academy row covers every way a request lost its spot.
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
  student, the class date and time, the note, the side (academy), a status badge and actions; neither
  shows `createdAt` or `decidedAt`. No sort, filter, search or paging.
- **Coach screen, mobile:** `frontend/apps/mobile/src/features/class-requests/class-requests-section.tsx`,
  the same merge/split helpers, a `showClosed` toggle (`class-requests-history-toggle`).
- **Backend:** `GET /app/class-requests` (`backend/padel_app/modules/frontend_api.py`,
  `class_request_service.list_requests_for`: coach or student scope, `id` descending, unpaginated,
  `serialize_class_request` lazy-loads `player.user`, `coach.user` and invitees per row).
  `GET /app/class-join-requests` (`class_join_request_service.list_join_requests_for`: `created_at`
  descending then `id`, unpaginated; `serialize_join_request_list_row` lazy-loads the instance, the
  player and an `Association_CoachPlayer` row per row). `decided_by_coach_id` is not serialized.
- **Statuses:** `backend/padel_app/models/class_request.py` enum `class_request_status` (pending,
  countered, accepted, declined, withdrawn; `decided_by` enum coach | student);
  `backend/padel_app/models/class_join_request.py` enum `class_join_request_status` (pending, accepted,
  rejected, withdrawn, superseded). `superseded` is written when the spot filled, the class closed at
  accept time, or the request moved to its side's waiting list (`class_join_request_service.py`).
  The automatic accept (`classes.join-requests` rule 21) goes through the same accept and sets
  `decided_by_coach_id`, so it cannot be told apart from a manual accept in the data.
- **Expiry:** a join request still pending when its class starts is closed (`classes.join-requests`
  rule 14). No job closes a private request whose slot has passed; it stays `pending` or `countered`.
- **Indexes:** `class_requests`: `coach_id`, `player_id`, `start_datetime`. `class_join_requests`:
  `coach_id`, `player_id`, `lesson_instance_id`, and a partial unique on pending rows.
  `lesson_instances.start_datetime` is indexed. `class_requests.created_at` comes from the base model
  and is nullable (`backend/padel_app/model.py`); whether any row has it null is not read in the data.
- **Paging convention:** `GET /app/coach_players_paginated` (`players.list` rule 2): `page`,
  `per_page` (default 25, clamped 1..100), `sort_by`, `sort_dir`; `player_service._ListPage` exposes
  `page, per_page, total, pages, has_prev, has_next`.
- **Name search:** `player_service.name_matches_query` / `@levelup/config` `nameMatchesQuery`
  (`players.search`, folding in Python, no `unaccent` in prod).
- **Pinned by:** `frontend/packages/config/src/class-request-list.test.ts`;
  `ClassRequestsSection.joinRequests.test.tsx` (CLASSES-JOIN-REQUESTS-15, -17),
  `.busySameHour`, `.nickname`, `.propose`, `.waitingList` tests in the same folder;
  `class-requests-section.nickname.test.tsx`, `.propose.test.tsx` on mobile;
  `backend/padel_app/tests/test_pad460_join_request_lists.py` (CLASSES-JOIN-REQUESTS-24); E2E
  `frontend/apps/web/e2e/class-requests/pad358-academy-class-booking.spec.ts`,
  `pad504-waiting-list-history.spec.ts`.

### Acceptance Criteria

#### CLASSES-COACH-REQUESTS-TABLE-1: One list holds both kinds of the calling coach's requests, and only a coach reads it (rule 1)
- **Given** coach Ana with a private request from Bruno and an academy request from Carla, and coach Rui with one request of each kind
- **When** Ana GETs `/api/app/coach-requests?section=open`
- **Then** she gets exactly her two rows, one `kind: private` and one `kind: academy`, each with every rule 1 field (Carla's with `side` and `classTitle`, Bruno's with `side: null`)
- **And** a student or a user with no coach profile gets `403`
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_lists_both_kinds_of_the_coachs_requests_only`

#### CLASSES-COACH-REQUESTS-TABLE-2: Each status lands in exactly one section, by the shared open-status constants (rules 2, 3)
- **Given** one private request in each of its five statuses and one academy request in each of its five statuses, all Ana's
- **When** Ana reads `section=open` and `section=history`
- **Then** Em aberto holds exactly the rows whose status is in const:PRIVATE_REQUEST_OPEN_STATUSES (private) or const:JOIN_REQUEST_OPEN_STATUSES (academy), Histórico holds the other seven, and no row is in both or neither
- **And** `counts` is `{open: 3, history: 7}` on both reads
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_each_status_is_in_exactly_one_section`

#### CLASSES-COACH-REQUESTS-TABLE-3: The server's split and the client helper's split read the same constants (rule 3)
- **Given** the open-status constants
- **When** the backend's section split and `@levelup/config` `isOpenClassRequestRow` classify every (kind, status) pair of rule 2
- **Then** both give the same answer for every pair, and both equal the constants' lists
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_open_statuses_match_the_constants`; `frontend/packages/config/src/class-request-list.test.ts` › `[CLASSES-COACH-REQUESTS-TABLE-3] open statuses match the constants`

#### CLASSES-COACH-REQUESTS-TABLE-4: Pages cover a section exactly once across both kinds (rule 4)
- **Given** Ana with 30 open private and 30 open academy requests at interleaved class times
- **When** she reads `section=open` page 1, 2 and 3 without `per_page`
- **Then** pages 1 and 2 hold const:COACH_REQUESTS_PAGE_SIZE rows, page 3 holds the rest, `total` is 60, `pages` and `hasNext` agree, and the three pages together list each of the 60 rows once, in rule 6's order
- **And** `per_page=500` is served as const:COACH_REQUESTS_MAX_PAGE_SIZE, and page 99 is an empty `rows` with `total` 60
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_pages_cover_the_section_once_across_both_kinds`

#### CLASSES-COACH-REQUESTS-TABLE-5: Em aberto opens on the nearest class, Histórico on the newest request (rule 6)
- **Given** open requests for classes on 3 Dec, 1 Dec and 2 Dec (made in another order) and closed requests made on 20, 22 and 21 Nov
- **When** Ana reads each section with no `sort_by`
- **Then** Em aberto lists 1, 2, 3 Dec, and Histórico lists the 22, 21, 20 Nov requests
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_default_orders_per_section`

#### CLASSES-COACH-REQUESTS-TABLE-6: Every sort key orders both directions and keeps one tie-break (rule 5)
- **Given** a fixture of both kinds that differs on every sort key, with two rows equal on each key
- **When** Ana reads with each `sort_by` of rule 5, `asc` then `desc`
- **Then** each order is the key's order, `desc` is the reverse of `asc` apart from the tie-break, rows equal on the key follow the tie-break (request instant descending, kind, id descending), and `class_time` orders by time of day, not by date
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_every_sort_key_both_directions`

#### CLASSES-COACH-REQUESTS-TABLE-7: Filters narrow the rows and the counts before the page is cut (rule 7)
- **Given** a fixture of both kinds, sides, statuses, students, class dates and times, and request days around a club-local midnight in summer time
- **When** Ana reads with each filter of rule 7 alone, and with kind + status + class date range together
- **Then** each read returns exactly the rows the filter describes, `total` and `counts` count only them, and a request made at 00:30 Lisbon time on 2 Jul (23:30 UTC on 1 Jul) is out of `requested_from=2026-07-01&requested_to=2026-07-01` and in the same read for 2 Jul
- **And** `side=none` returns every private row, a status of the other section returns nothing, and `class_to=not-a-date` answers `400 invalid_filter`
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_each_filter_narrows_rows_and_counts`

#### CLASSES-COACH-REQUESTS-TABLE-8: The name search is the players search (rule 7)
- **Given** requests from "João Sousa", "Joana Silva" and "Pedro Mesquita e Sousa"
- **When** Ana searches `joao`, then `pedro sousa`, then `%`
- **Then** `joao` finds João only, `pedro sousa` finds Pedro Mesquita e Sousa only, and `%` finds nobody — the same answers `player_service.name_matches_query` gives for those names
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_search_matches_like_the_players_search`

#### CLASSES-COACH-REQUESTS-TABLE-9: A page's query count does not grow with the coach's requests (rule 8)
- **Given** Ana with 10 requests, then with 600 (both kinds, with invitees, sides and notes)
- **When** she reads page 1 with `per_page` = const:COACH_REQUESTS_MAX_PAGE_SIZE, with a search and a filter on
- **Then** each read issues at most const:COACH_REQUESTS_QUERY_BUDGET SQL statements, and the 600-request read issues no more than the 10-request read
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_page_query_count_is_bounded`

#### CLASSES-COACH-REQUESTS-TABLE-10: The old list endpoints answer as before (rule 9)
- **Given** Ana's requests of both kinds
- **When** Ana and a student GET `/api/app/class-requests` and `/api/app/class-join-requests`
- **Then** the rows, their order and their fields are those `classes.class-requests` rule 9 and `classes.join-requests` rule 17 describe, with no paging fields
test: `backend/padel_app/tests/test_pad795_coach_requests_table.py` › `test_old_list_endpoints_unchanged`

#### CLASSES-COACH-REQUESTS-TABLE-11: Each status reads one label, the same on both shells, in pt and en (rule 10)
- **Given** every (kind, status, decidedBy) of rule 10's table
- **When** `classRequestStatusLabel` renders it in pt and in en
- **Then** it returns that row's words, `declined` by the student reads differently from `declined` by the coach, and no pair falls back to the raw status
test: `frontend/packages/config/src/class-request-status-label.test.ts` › `[CLASSES-COACH-REQUESTS-TABLE-11] every status has its label in pt and en`

#### CLASSES-COACH-REQUESTS-TABLE-12: The web table shows two tabs with counts and the eight columns in order (rules 11, 1)
- **Given** the endpoint answers an open page with one private and one academy row and `counts {open: 2, history: 5}`
- **When** the coach opens `/class-requests`
- **Then** "Em aberto (2)" is selected and "Histórico (5)" is beside it, the header reads the eight columns of rule 11 in order plus actions, and each row's cells show its class day and time, request day and time (club-local), student, kind, side ("—" for the private row) and rule 10's label
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-12] tabs with counts and the eight columns`

#### CLASSES-COACH-REQUESTS-TABLE-13: Sorting, filtering and switching tabs on web send the params and go back to page 1 (rules 5, 7, 11)
- **Given** the coach on Histórico page 3
- **When** they press "Aluno", press it again, set kind Privada and a class date range, type "joao", then press "Limpar filtros"
- **Then** each step requests the endpoint with the matching `sort_by`/`sort_dir`/filter params and `page=1`, the URL query carries the same state, and a reload of that URL requests the same page
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-13] sort, filters and tab reset the page and live in the URL`

#### CLASSES-COACH-REQUESTS-TABLE-14: The web pager walks the pages (rules 4, 11)
- **Given** an answer with `page 1, pages 3, hasNext true`
- **When** the coach presses next twice, then previous
- **Then** pages 2, 3 and 2 are requested, the pager reads "2 / 3", next is disabled on page 3 and previous on page 1
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-14] the pager walks the pages`

#### CLASSES-COACH-REQUESTS-TABLE-15: Em aberto rows keep today's actions; Histórico rows have none (rule 13)
- **Given** an open private `pending` row, an open private `countered` row, an open academy `pending` row for a student below the bar, and a Histórico row
- **When** the coach looks at each and accepts the academy row
- **Then** the private pending row offers accept, decline and propose another time; the countered row offers none of them; the academy row offers accept and reject, and its accept asks the below-the-bar confirmation before sending `{confirm: true}`; the Histórico row offers nothing — on web and on mobile
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none`; `frontend/apps/mobile/src/features/class-requests/coach-requests-list.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-15] open rows keep their actions, history rows have none`

#### CLASSES-COACH-REQUESTS-TABLE-16: The table refreshes on every request event and keeps its view (rule 14)
- **Given** the coach on Histórico, sorted by student, filtered to academy, on page 2
- **When** `class_request_changed`, `join_request_created` and `join_requests_superseded` arrive, and when the coach decides a request
- **Then** the endpoint is read again each time with the same section, sort, filters and page — on web and on mobile
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-16] refreshes on request events and keeps the view`; `frontend/apps/mobile/src/features/class-requests/coach-requests-list.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-16] refreshes on request events and keeps the view`

#### CLASSES-COACH-REQUESTS-TABLE-17: A row opens its detail (rule 15)
- **Given** a private request declined by the student with a note, an academy request with `decidedBy` null, and a weekly private request
- **When** the coach opens each
- **Then** the detail shows the note, the request instant, the decision instant and "Aluno" / "—" as the decider, and the weekly request's weekdays and end date — on web and on mobile
test: `frontend/apps/web/src/components/class-requests/CoachRequestsTable.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-17] a row opens its detail`; `frontend/apps/mobile/src/features/class-requests/coach-requests-list.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-17] a row opens its detail`

#### CLASSES-COACH-REQUESTS-TABLE-18: Mobile shows compact rows with the same fields and tabs (rule 12)
- **Given** the endpoint answers as in CLASSES-COACH-REQUESTS-TABLE-12
- **When** the coach opens Pedidos de Aula on iOS
- **Then** the two tabs show the same counts, and each compact row shows class date and time, request date and time, student, kind badge, side and rule 10's label
test: `frontend/apps/mobile/src/features/class-requests/coach-requests-list.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-18] compact rows carry the table's fields`

#### CLASSES-COACH-REQUESTS-TABLE-19: Mobile's "Filtrar/Ordenar" sheet sends the same params, and the list loads the next page at its end (rules 5, 7, 12)
- **Given** an answer with `hasNext true`
- **When** the coach scrolls to the end, then opens "Filtrar/Ordenar", picks sort by student descending, kind Academia and a search, and applies
- **Then** page 2 is requested and appended; after applying, page 1 is requested with the same `sort_by`/`sort_dir`/filter params the web sends for the same choices, and no further page is requested once `hasNext` is false
test: `frontend/apps/mobile/src/features/class-requests/coach-requests-list.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-19] the sheet sends the web's params and pages load at the end`

#### CLASSES-COACH-REQUESTS-TABLE-20: The student's list is untouched (Not this spec)
- **Given** a student with a pending private request, a decided academy request and a waiting-list place
- **When** she opens her requests in Availability on web and on iOS
- **Then** she sees today's merged newest-first list with its open part and its "Histórico" toggle, read from the two old endpoints and the waiting list, and the coach endpoint is never called
test: `frontend/apps/web/src/components/class-requests/ClassRequestsSection.joinRequests.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads`; `frontend/apps/mobile/src/features/class-requests/class-requests-section.student.test.tsx` › `[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads`

### Performance
A coach with thousands of requests reads one page in a bounded number of statements
(CLASSES-COACH-REQUESTS-TABLE-9). Before the PR merges, the build measures the endpoint on a staging
copy shaped like the busiest coach (`GET /app/coach-requests`, each section, default sort, a search and
a filter) and writes the timings in the PR; a page over 300 ms server time there reopens the index
question below. This is a check of the build, not a criterion: the bound that holds forever is the
statement count.

### Waves
1. **Backend list shape.** `constants.md`; CLASSES-COACH-REQUESTS-TABLE-1, -2, -3 (backend half), -4,
   -5, -6, -7, -8, -9, -10 — `GET /app/coach-requests`, a new service beside `class_request_service` /
   `class_join_request_service`, batch-loading serializers; `@levelup/api` resource and types.
2. **Web.** CLASSES-COACH-REQUESTS-TABLE-3 (client half), -11, -12, -13, -14, -15 (web), -16 (web),
   -17 (web), -20 (web) — `@levelup/config` status labels and the open-status constants,
   `CoachRequestsTable` on `ClassRequestsPage`, row actions reused from `ClassRequestsSection`;
   pt/en strings; the amended CLASSES-JOIN-REQUESTS-15 test moves to the table.
3. **Mobile.** CLASSES-COACH-REQUESTS-TABLE-15 (mobile), -16 (mobile), -17 (mobile), -18, -19,
   -20 (mobile) — the coach's Pedidos de Aula screen on Expo, the "Filtrar/Ordenar" sheet, pt/en
   strings imported statically (`frontend/CLAUDE.md`'s mobile i18n trap).
Web and mobile ship in the same PR (owner: "web and iOS together, own PR").

### Open questions
Every item below was decided in this run (the owner said the spec goes to a fresh-agent review next);
each is reversible at review.
- **Migration / index: no.** Both tables already index `coach_id`; a coach's requests number in the
  hundreds to low thousands, which the database sorts in memory per read, and the plan (booking stream
  plan, 13 Nov) needed a migration only for an `expired` status, which the owner ruled out. The
  performance check above reopens this (a `(coach_id, created_at)` index on each table) if a page is
  slow on staging data. — decided by me.
- **Em aberto = still open, not "awaiting the coach".** The ticket defines Em aberto as requests
  awaiting the coach; a `countered` private request awaits the student. Options: (a) keep today's split
  (pending + countered open), (b) move `countered` to Histórico. Decision: (a), because it is the split
  both shells and CLASSES-JOIN-REQUESTS-25 already use, a countered request is not closed, and the
  label "Proposta enviada ao aluno" says who it waits on. — decided by me.
- **A private request whose slot has passed stays in Em aberto.** No job closes it (Today), and under
  Em aberto's default order it sorts to the top. Options: (a) show it as today, (b) hide or relabel
  it (that would be the derived `expired` the owner ruled out). Decision: (a). A cleanup that closes
  such requests is a separate ticket if the owner wants one. — decided by me.
- **Page size 25, max 100.** The plan asked "how many per page" without a pick. Decision: the roster's
  25 / 100 (`players.list`), so the coach's two paged lists behave alike. — decided by me.
- **Default order: Em aberto by nearest class, Histórico by newest request.** From the ticket's own
  "A definir" list; the owner's words do not override it. — lead's pick, reversible.
- **"Pedido: hora" sorts by the request instant and has no time-of-day filter; "Aula: hora" sorts and
  filters by time of day.** The request instant is stored in UTC, and its club-local time of day needs a
  per-row timezone conversion SQL cannot do portably (SQLite tests, Postgres prod); the class time is
  stored as wall clock and can. The ticket asks each column to sort and filter. — decided by me.
- **Student search: free text on the server, folded like the players search.** Options: (a) a
  student picker from the roster (cannot reach former students who still have requests), (b) free text
  folded in Python over all rows (defeats SQL paging), (c) free text folded in Python over the coach's
  distinct requesters, then an SQL `IN`. Decision: (c), coherent with `players.search` and cheap. —
  decided by me.
- **Status sort uses a fixed order (const:COACH_REQUESTS_STATUS_ORDER), not the labels' alphabet**,
  so pt and en sort alike. — decided by me.
- **Status labels (rule 10) are proposed copy.** "Recusada pelo aluno" for a proposal the student
  declined, "Sem vaga" for every `superseded` (spot filled, class closed, moved to the side's waiting
  list: the data does not say which). For the owner's approval. — decided by me.
- **Row detail (rule 15).** The ticket lists it under "A definir"; the owner's words did not rule on it.
  Kept because the data exists and it costs one panel. "Who decided" for an academy row is "Treinador"
  or "—": an automatic accept (rule 21) writes the coach as decider, so it cannot be told apart. —
  lead's pick, reversible.
- **Coach-only endpoint, new route `GET /app/coach-requests`,** rather than paging the two old
  endpoints: installed iOS builds read those, and one sorted page across two tables needs one query. —
  decided by me.
- **`serves: P-CLASSES-4`.** The table serves both P-CLASSES-3 (private requests) and P-CLASSES-4
  (academy requests); the frontmatter takes one, and P-CLASSES-4 is the promise that names "Pedidos de
  Aula". — decided by me.
- **The URL keeps the table's state on web (rule 11); mobile keeps it in the screen's state only.** —
  decided by me.
- **This spec touches two others.** `classes.join-requests` rule 17 and CLASSES-JOIN-REQUESTS-15
  (the coach's list order) and `classes.class-requests` rule 9 (which list reads which endpoint) are
  amended in the same commit; no rule, Not-this-spec line or recorded owner decision conflicts.
