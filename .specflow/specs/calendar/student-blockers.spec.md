---
id: calendar.student-blockers
status: implemented
depends_on: [calendar.blocks, notifications.invitations]
implements: ../../specs-business/calendar/student-controls-invitation-availability.business.md
governed_by: []
---

# calendar.student-blockers


### Intent
Students set availability blockers (one-time or recurring) so the smart notification
engine does NOT send them AUTOMATIC class invitations during times they are unavailable.
Reuses the existing CalendarBlock model (type `unavailable`, `blocks_auto_invitations=true`)
rather than a separate table.

### Status correction (2026-08-07)
Only the **PAD-28** half of this spec is implemented: blocker CRUD (rules 1–3) and eligibility-time
filtering of automatic invitation candidates (rule 5, `filter_blocked_coach_players`).

The **PAD-107** half — rules 4, 8, 9, 10 and 11 — is **specced but never landed**. There are no
`PAD-107` references anywhere in the backend, no `POST /api/app/notify/availability_conflicts`
endpoint, no blocked-student skip in `/notify/manual` or `/notify/send_reminders`, and no
blocker backstop in `_send_system_message` (which guards only against empty message text). Those
rules describe intended behaviour, not shipped behaviour, and any spec that leans on them — notably
`notifications.student-block-preferences` — inherits the gap.

### Entities
- **CalendarBlock** (reused): student blockers are rows with type `unavailable` and `blocks_auto_invitations=true`.

### Rules
1. Students manage blockers from a dedicated `/availability` page (player-only nav item).
2. Blocker CRUD (student-scoped): `GET`/`POST` `/api/app/availability_blockers`, `PUT`/`DELETE` `/api/app/availability_blockers/{id}`. Non-student users get 403.
3. Both one-time and recurring (weekly) blockers are supported, using the same recurrence machinery as calendar blocks. A recurring blocker edited to one-time stops suppressing on every later week: the edit clears the recurrence rule the engine (rule 5) reads, not only the flag (`calendar.blocks` rule 10; PAD-377 — before it, a student who reduced a weekly "away" to one day went on being skipped for invitations every week).
4. Scope of suppression (PAD-107): a blocker suppresses EVERY class-slot solicitation during its window — automatic invitations, manual invitations, reminders and waiting-list offers. A coach may still ADD the student to a class in that window (enrolment is a coach decision), but only after explicitly confirming a warning, and the student is never notified about it.
5. The auto-invitation eligibility engine (`get_eligible_students` and `_get_eligible_students_for_group`) filters out any candidate whose owning user has a blocker occurrence overlapping the class instance window.
6. Timezone: datetimes stored as UTC; recurring occurrences evaluated against the club / Lisbon timezone.
7. The student's availability view clearly indicates each blocker (title, one-time date or recurring days, time window, and an "unavailable / won't receive auto-invitations" indication).
8. Conflict pre-check (PAD-107): `POST /api/app/notify/availability_conflicts` with `{date, startTime, endTime, playerIds}` returns `{blocked: [{playerId, name}]}` — the subset of those players whose owning user has a blocker overlapping the proposed window. Coach-only (403 otherwise). It returns player names ONLY; blocker titles, descriptions and times are the student's private calendar and are never exposed to the coach.
9. Scheduling warning (PAD-107): when a coach schedules a class whose window overlaps a selected student's blocker, the UI warns before creating and requires explicit confirmation ("O aluno (nome) marcou-se como indisponível nesta hora. Tem a certeza que pretende avançar com ele na aula? Não poderá enviar-lhe notificações neste período por ele estar marcado como indisponível e não querer ser incomodado."). Cancelling aborts the create; confirming creates the class normally. For a recurring class the check is evaluated on the first occurrence.
10. Send-time block (PAD-107): `POST /api/app/notify/manual` and `POST /api/app/notify/send_reminders` SKIP blocked students, still deliver to everyone else, and return `{sent, blocked: [{playerId, name}]}`. The UI surfaces "Não pode enviar notificações ao aluno (nome) neste horário, pois ele marcou-se como indisponível."
11. Hard backstop (PAD-107): `_send_system_message` refuses to deliver any `notification_invite`, `notification_reminder` or `waiting_list_offer` bound to a lesson instance whose window overlaps a blocker of the recipient. This is the single delivery choke point, so it also covers the APScheduler reminder job, the auto-invitation rounds and the waiting-list cascade — not just the coach-facing buttons. Neither the chat message nor the web/Expo push is created.
12. The window compared is always the CLASS INSTANCE window (`start_datetime`/`end_datetime`), never the moment the notification is sent.
13. Mobile-responsive (PAD-119): the `/availability` page fits within the viewport at small screen widths (≥320px) — the document never scrolls horizontally, and every control, notably the "Add blocker" action, is fully visible without horizontal scrolling. The page header stacks vertically below the `sm` breakpoint rather than forcing the title and the action button onto one row.

14. **(PAD-356) The student's availability tab is two cards, each with an explanation and its own
    call to action, on web and iOS. There is no floating "+".**
    - **Indisponibilidade** (`availability-blockers-card`): an explanation of what a block does,
      a **Criar bloqueio** CTA (`availability-create-blocker`), and the student's blocks listed
      inside the card (`blocker-card-<id>`, with edit `blocker-edit-<id>` and delete
      `blocker-delete-<id>` → `blocker-delete-confirm`). The empty state is
      `availability-blockers-empty`.
    - **Pedidos de aula** (`class-requests`): `classes.class-requests` (rules 1–11) re-homed as
      the second card, with its explanation, a **Marcar aula** CTA (`class-request-book`; until
      PAD-357 it opens today's booking form), and the student's open requests with their state
      ("À espera do treinador" for `pending`) and **Retirar** (`class-request-withdraw`).
15. **(PAD-356) Blocks are created and edited in a bottom sheet** (`blocker-sheet`) with a
    **single / recurring** choice (`blocker-mode-single` | `blocker-mode-recurring`).
    - Single: a date, start and end time, and a reason.
    - Recurring: weekdays (`blocker-day-<n>`, JS `getDay`), a start date and an end date, start
      and end time, and a reason.

    The reason is the existing optional `title` field, labelled "Motivo (opcional)"; no new
    column. Save is `blocker-save` and cancel is `blocker-cancel`.
16. **(PAD-356) Block validation is shared and runs before any request.**
    `blockerDraftError(draft)` in `@levelup/config` returns `date_required` (no date),
    `time_required` (a start or end time that is empty or not HH:MM, e.g. a cleared time input),
    `end_before_start` (end time not after start time), `end_date_before_start_date` (recurring
    end date before the start date), or `null`. Both shells render
    `availability.validation.<code>` on the error element (web `blocker-error` with
    `data-reason`; iOS `blocker-error-<code>`) and do not submit.
    `blockerDraftToInput(draft)` builds the payload: a recurring block with no weekday uses the
    start date's weekday, and a missing end date means start date + 3 months (the previous
    behaviour of both shells).

12. **An edit writes what was sent (PAD-386).** `PUT /api/app/availability_blockers/{id}` follows
    `calendar.blocks` rule 11: an emptied reason (`title: null`) is cleared; a `null` end while the
    blocker still recurs is 400 `["endDate"]` (the shared builder never sends one — it defaults the
    end to three months on create).

### Acceptance Criteria

#### Blocker suppresses auto-invitation
- **Given** a student with an `unavailable` blocker overlapping a class instance window
- **When** the invitation engine computes eligibility for that instance's vacancy
- **Then** the student is NOT in the eligible list

#### Non-overlapping blocker does not suppress
- **Given** a student whose only blocker does not overlap the class window
- **When** eligibility is computed
- **Then** the student IS eligible

#### Coach is warned when scheduling into a blocked window
- **Given** a coach creating a class at a time overlapping a selected student's blocker
- **When** they submit the class
- **Then** a confirmation warning names the student and states that notifications cannot be sent in that period
- **And** cancelling aborts the create; confirming creates the class with that student enrolled

#### Manual notification to a blocked student is refused
- **Given** an enrolled student with a blocker overlapping the class window
- **When** the coach clicks "Lembrar" or manually notifies that student
- **Then** no message, web push or Expo push reaches that student
- **And** the response reports them under `blocked` and the UI shows the "cannot send notifications" warning
- **And** other enrolled students who are not blocked still receive their notification

#### Blocked student is never reached by any class-slot notification
- **Given** a student with a blocker overlapping a class instance window
- **When** any path fires (auto invitation round, scheduler reminder, waiting-list offer, manual send)
- **Then** no `Message` is created for that student for that instance and no push is dispatched

#### Student manages blockers
- **Given** an authenticated student
- **When** they open `/availability`
- **Then** they can create, edit, and delete one-time and recurring blockers
- **And** each blocker is clearly shown as an unavailable window

#### Availability page fits the mobile viewport
- **Given** an authenticated student on a mobile-width viewport (375px)
- **When** they open `/availability`, with and without the blocker form expanded
- **Then** the document does not scroll horizontally (`documentElement.scrollWidth <= clientWidth`)
- **And** the "Add blocker" button is fully inside the viewport (its right edge is within the viewport width)

#### The availability tab is two cards with no floating action (PAD-356)
- **Given** an authenticated student
- **When** they open the availability tab on web or iOS
- **Then** the Indisponibilidade card (explanation, Criar bloqueio, the student's blocks) and the Pedidos de aula card (explanation, Marcar aula, open requests with state and Retirar) are shown, and there is no floating "+"

#### A block is created from the sheet, single or recurring (PAD-356)
- **Given** the Criar bloqueio sheet
- **When** the student saves a single block with a reason, or a recurring block on chosen weekdays with a start and end date
- **Then** the block is created and listed in the Indisponibilidade card with its reason

#### An end before the start is refused before any request (PAD-356)
- **Given** the sheet with an end time at or before the start time (or a cleared start or end time, or, recurring, an end date before the start date)
- **When** the student saves
- **Then** the sheet shows `availability.validation.end_before_start` (or `time_required`, or `end_date_before_start_date`) and no request is sent
