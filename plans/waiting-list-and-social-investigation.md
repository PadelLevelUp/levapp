# Investigation — waiting list, eligibility, student self-service, social graph, roster sharing

Date: 2026-08-05. Code read on `levelup_backend@feature/pad-116` (findings re-checked against
`origin/main`) and `levelup_frontend` main. Line references are to those checkouts.

> **Outcome (2026-08-07)** — §8's design was approved by the stakeholder and specced.
> **New:** `specs/eligibility/spec.md` (`eligibility.rules`, `.cascade`, `.enforcement`,
> `.open-spot-visibility`) and `classes.join-requests`.
> **Amended:** `notifications.invitations` (3a/3b), `notifications.waiting-list` (3a/4a–4d),
> `notifications.config` (7a–7c), `calendar.view` (4, 6), plus `_index.md`.
> **Status corrections:** `players.add-existing` → draft, `calendar.student-blockers` → partial.
> **Linear:** bugs PAD-122, PAD-123, PAD-124, PAD-125; investigations PAD-126, PAD-127; stories
> PAD-128 → PAD-129 → (PAD-130 + PAD-131), with PAD-132 deferred.
> Decisions taken: rounds survive **capped at the bar**; manual add **warns with a named reason**;
> tightening the bar **never removes** anyone; eligibility parameters are **level + absences only**;
> **no payments** in v1. One open question remains — see PAD-131 rule 8 (what "a credit" means).

Every question below is answered as **Today** (what the code actually does) → **Gap** →
**Touch points** (what a build would have to change). No code was changed and no specs were edited.

---

## 1. How does the waiting list work today?

There are **two** tables, and only one of them is really reachable by a human.

| Entity | File | Meaning |
|---|---|---|
| `StandingWaitingListEntry` | `levelup_backend/padel_app/models/standing_waiting_list_entry.py` | A coach-issued, pre-paid *subscription*: `coach_id`, `player_id`, `credits_total`, `credits_used`, `expires_at`, `is_active`. **No level, no weekday, no time window, no class list.** |
| `WaitingListEntry` | `levelup_backend/padel_app/models/waiting_list_entry.py` | One row per *class instance* the player is queued for. Unique on `(lesson_instance_id, player_id)`. Optionally back-linked to a standing entry via `standing_entry_id`. |

### The lifecycle

1. **Coach adds a standing entry** — Player detail page → "Waiting list" action
   (`levelup_frontend/apps/web/src/pages/PlayerDetailPage.tsx:273`) opens
   `AddToStandingWaitingListDialog.tsx`, which collects **credits (default 3) + duration
   (7/14/30/60 days) and nothing else**. `POST /api/app/notify/standing_waiting_list`
   → `add_standing_waiting_list_entry()`
   (`padel_app/services/notification_service.py:3062`).
   Same section exists in Settings → Notifications (`StandingWaitingListSection.tsx`) with a
   type-ahead over `GET /api/app/notify/player_search`, and on mobile
   (`apps/mobile/app/player/[playerId].tsx:270`).
2. **Fan-out** — `_fan_out_standing_entry()` (`notification_service.py:3032`) immediately creates a
   `WaitingListEntry` for **every upcoming, non-cancelled class instance of that coach**. Not the
   ones matching the student's level, not the ones with space — *all* of them.
   `_sync_standing_entries_for_new_instance()` (`:3120`) does the same for each newly materialized
   instance, so the queue keeps growing as the calendar rolls forward.
3. **Consumption** — when a vacancy opens (a student declines an invite, cancels attendance, or the
   class is short of `max_players`), `_send_invitation_batch()` (`:2009`) checks the waiting list
   **before** it invites anybody: `_check_waiting_list()` (`:2754`) picks the top-ranked active
   entry, and `_fill_from_waiting_list()` (`:2840`) *directly enrols* the player — no invitation, no
   consent — marks the vacancy filled, burns one credit, deactivates the standing entry when
   `credits_used >= credits_total`, and sends a `waiting_list_placed` chat message.
4. **Semi-automatic mode** gates this: waiting-list auto-fill does not run until the coach approves
   the vacancy (`specs/notifications/spec.md:316`), and the approval card discloses "X from the
   waiting list will be added directly".
5. **Coach visibility** — `GET /api/app/notify/waiting_list/{instance_id}` lists active entries for a
   class. It has **no frontend caller**; nothing in the UI shows who is queued for a given class.

So in practice: *the waiting list is a coach-managed, pre-paid replacement pool. When someone drops
out, the top-ranked pool member is silently dropped into the class and one credit is spent.*

### The other path — `WaitingListEntry` with `standing_entry_id = NULL` — is dead in the UI

`respond_to_waiting_list()` (`:2666`) creates a self-service entry when a student answers "yes" to a
`waiting_list_offer` message, exposed as `POST /api/app/notify/respond_waiting_list`. It is
unreachable from either client:

- **No caller.** `grep` for `respond_waiting_list` across `apps/web/src`, `apps/mobile`, and
  `packages/api` returns zero hits (only the settings *template editor* mentions the string).
- **No buttons.** `MessageBubble.tsx:56-58` branches on `notification_invite`,
  `notification_reminder` and `replacement_approval` only; `waiting_list_offer` is not a case, so
  the offer arrives as **plain text with no Yes/No**. Mobile is the same
  (`apps/mobile/src/features/messages/components/message-bubble.tsx:134`).

`_offer_waiting_list()` (`:2637`) is itself only called from two spots in `respond_to_notification`
(`:2415`, `:2437`) — the "sorry, the spot was just filled" path. So the only student-facing waiting
list message the app can send is one nobody can act on.

---

## 2. How can eligibility be added, so a waiting-list student is only queued for the *right* classes?

**This is the single biggest gap, and it is worse than it looks.**

### Today: eligibility is effectively OFF for the waiting list

`_check_waiting_list()` (`notification_service.py:2769-2810`):

```python
invitation_groups = config.get_invitation_groups()
...
if invitation_groups:
    # All active waiting list entries compete; no group-criteria filter
    eligible_entries.append((entry, cp))
else:
    # legacy rounds-based filter: same_level / same_side / max_unjustified_absences
```

`get_invitation_groups()` (`padel_app/models/notification_config.py:296`) falls back to
`DEFAULT_INVITATION_GROUPS` (`:122`), which is **non-empty for every coach who has never touched the
setting**. The `if` branch is therefore the normal case: *for the default configuration, a
waiting-list candidate is matched to a vacancy with no level check, no side check and no absence
check at all.* The legacy `else` branch — the only one that filters — is the one almost nobody hits.

On top of that, `_fill_from_waiting_list()` bypasses everything the invitation path applies:

| Guard | Invitations (`_get_eligible_students_for_group`, `:505`) | Waiting-list fill (`_check_waiting_list`) |
|---|---|---|
| Level / side / absence rules | ✅ `_passes_group_rules()` | ❌ skipped when groups configured |
| `restrictions.excludedPlayers` | ✅ | ❌ |
| `restrictions.excludeUnpaidSubscription` | ✅ | ❌ |
| Student availability blockers (PAD-28) | ✅ `filter_blocked_coach_players()` | ❌ |
| Already enrolled in this instance | ✅ `enrolled_ids` | ❌ |

The last row is a live defect, and its sharpest form is a loop: fan-out queues a standing-entry
student for classes **they are already enrolled in**, and `_check_waiting_list` filters on neither
enrolment nor presence status. So when that student cancels:

1. the cancellation creates the vacancy (`_create_vacancy_for_absent_player`, `:1185`);
2. `_send_invitation_batch` checks the waiting list *first* (`:2009`);
3. **the cancelling student's own entry for that instance is a valid candidate**;
4. `_fill_from_waiting_list` "places" them — `_add_player_to_instance` finds the association and the
   `absent` presence already there and skips both;
5. the vacancy is marked `filled_by_player_id = <the person who just cancelled>`, **a credit is
   burned**, and a `waiting_list_placed` message is sent to them.

The real spot is never offered to anyone. Nothing looks broken from outside — the class reads as
correctly sized and just quietly runs one player short.

`specs/calendar/spec.md:126` also describes a PAD-107 hard backstop in `_send_system_message` that
refuses `waiting_list_offer` to a blocked student. It is absent — see finding #6 below; PAD-107
never landed at all, so this is a spec-ahead-of-code divergence rather than a regression.

### Gap

Two different things are missing and they should not be conflated:

- **(a) Match-time eligibility** — the vacancy-vs-candidate check, which already exists and is simply
  not being called.
- **(b) Entry-level scope** — "put Ana on the waiting list *for B2 classes on Tuesday evenings*".
  `StandingWaitingListEntry` has no columns for this whatsoever.

### Touch points

**(a) is cheap and I'd do it first.** `_passes_group_rules(rules, cp, vacancy, coach_id, instance)`
(`:417`) takes exactly the arguments `_check_waiting_list` already has in hand. Evaluate it at
**fill time** rather than at fan-out time — fill-time stays correct when a student's level changes,
mirrors how invitations already work, and needs no migration:

- `notification_service.py:2769` — run the group rules against each candidate instead of the blanket
  append.
- **Which rules apply is ambiguous today, and §8 dissolves the ambiguity.** `_check_waiting_list`
  receives `round_number`, and `DEFAULT_INVITATION_GROUPS`' round 3 is `{"id": "3", "rules": []}` —
  an intentional last-resort broadcast. Following the round ladder therefore still yields *zero*
  filtering at round 3, which is where vacancies land once rounds 1 and 2 come back empty.
  Acceptable for an invitation (an offer the student can decline); not for a waiting-list fill (a
  **silent enrolment**). With the eligibility layer of §8 there is exactly one bar, so the fill
  simply checks eligibility and the round question disappears. **If §8 is being built, do this fix
  as part of it rather than twice.** If it is not, the interim rule should be the strictest group,
  precisely because consent is not in the loop.
- Same function — add `enrolled_ids`, the two `restrictions` filters and
  `filter_blocked_coach_players` so the fill path matches the invite path.
- Decide explicitly whether a waiting-list fill should still be *silent* for a student who has
  blocked that window; PAD-107's stated intent says no.

**(b) needs a data change.** Add scope columns to `standing_waiting_list_entries` (a `level_id`
allowlist, weekday/time-window, or an explicit lesson allowlist — level + weekday covers most of
what a padel coach means by "the right classes"), then:

- migration under `levelup_backend/migrations/versions/`
- `add_standing_waiting_list_entry()` + `POST /standing_waiting_list` payload
  (`padel_app/modules/notification_engine_api.py:239`)
- `_fan_out_standing_entry()` / `_sync_standing_entries_for_new_instance()` so `activeClassCount`
  stops over-reporting (today it counts every future class of the coach)
- `AddToStandingWaitingListDialog.tsx` (currently credits + duration only),
  `StandingWaitingListSection.tsx`, and the mobile `waiting-list-dialog`
- `specs/notifications/spec.md` §`notifications.waiting-list` rules 3, 4, 10

---

## 3. How would a student propose themselves to a class?

**Today: they cannot.** This is three separate gaps, not a missing button.

1. **No discovery.** The calendar shows a player only "classes they're enrolled in"
   (`specs/calendar/spec.md:18`, rule 4). A student cannot see that Tuesday 19:00 B2 exists, let
   alone that it has a free spot.
2. **No student-initiated endpoint.** The only join path, `respond_to_waiting_list()`, is *reactive*
   — it requires a `lesson_instance_id` that arrived in an offer message, and as shown above it has
   no client caller and no UI affordance. There is no "request to join class N" concept anywhere in
   the model: no request status, no coach approval, no rejection reason.
3. **No coach-side triage.** `GET /notify/waiting_list/{instance_id}` exists but is uncalled; there
   is no inbox of pending requests. Nothing checks class capacity on join either, even though the
   spec's stated intent is that waiting lists are *for full classes*.

### Touch points for a real "propose myself" flow

- **Backend:** a `ClassJoinRequest` model (player, lesson_instance, status
  `pending|approved|declined|withdrawn`, requested_at, decided_at) — or reuse `WaitingListEntry` and
  add a status column, which is cheaper but muddies the "pre-paid pool" meaning of the same table.
  Endpoints: student `POST /class_request`, `DELETE` to withdraw; coach `GET` pending +
  `POST /class_request/{id}/respond`. On approve, reuse `_add_player_to_instance()` (`:1097`) so
  presence/enrolment stay consistent.
- **Discovery:** a student-scoped "open classes" read — the coaches on the student's
  `Association_CoachPlayer` rows, upcoming instances, effective level match
  (`effective_level_id`, `:160`), `_effective_filled_spots()` (`:1090`) < `max_players`. This is the
  piece that decides whether the feature is usable; without it there is nothing to propose *to*.
- **Frontend:** a student-facing browse view (web `apps/web/src/pages/` + mobile), a coach
  requests-inbox surface (dashboard block or class detail sheet tab), and a new
  `class_join_request` message type wired into `MessageBubble` — the *same* wiring that
  `waiting_list_offer` is missing today, so do both in one pass.
- **Specs:** new leaf under `specs/classes/` (`classes.join-requests`) plus a
  `notifications.waiting-list` cross-reference.

---

## 4. How can students "ask each other to follow" and message each other?

**Today: neither exists.** There is no follow/friend concept anywhere in the backend — no model, no
table, no endpoint.

Messaging permission is decided by one function, `_messageable_target_ids_for()`
(`padel_app/services/messaging_service.py:40`):

```
Coach   -> the users of players in any club the coach belongs to
Everyone else (student) -> ANY coach whose user status is 'active'
```

Enforced by `_assert_messageable()` (`:65`) on conversation creation and surfaced by
`GET /api/app/messageable-users` (`frontend_api.py:492`). So **student → student is a 403**, and the
existing safety primitives are already in place: `BlockedUser` (block either way, checked at
`:293`), `MessageReport`, plus a report dialog in the web client.

Worth flagging while you are in there: the current rule lets **any student DM any active coach in the
entire system**, with no relationship required. If this predicate is being rewritten to widen it,
tighten that side in the same change rather than only opening it further.

### Touch points for follow + student↔student DM

- **Model:** `FollowRequest`/`Connection` (requester_user_id, target_user_id, status
  `pending|accepted|declined`, unique on the ordered pair). Mutual-accept ("connection") is the
  right shape here rather than Twitter-style one-way follow, because the payoff is a DM permission,
  and a DM permission should be consented to by both sides.
- **Permission:** extend `_messageable_target_ids_for()` to union accepted connections. Everything
  downstream (`create_conversation_service`, block checks, push, SSE) then works unchanged — this is
  genuinely a one-predicate change.
- **Discovery:** students need a way to *find* each other before they can request. The natural
  scope, and the one that avoids a global user-search, is "students who share a class instance
  with me" via `Association_PlayerLessonInstance`.
- **UX/policy:** requests need an inbox + accept/decline, and blocking must pre-empt requests, not
  just conversations. Some of this roster is likely to include minors — worth deciding up front
  whether students under a certain age can be discovered at all, and whether a coach can disable
  student↔student contact for their roster. That is a product decision, not a code one, but it
  belongs in the spec before the model is written.
- **Specs:** new `messaging.connections` leaf; amend `messaging.conversations` rules.

---

## 5. How can we create groups?

The data model already supports groups; **the clients cannot ask for one, and one key design
decision blocks the obvious feature set.**

- `Conversation` (`padel_app/models/conversations.py`) has `is_group` and `group_name`.
- `create_conversation_service()` (`messaging_service.py:281`) computes
  `is_group = len(set(participants)) > 2` — correct since PAD-93 — but **never sets `group_name`**,
  and the payload has no field for it.
- Both clients type the request as `otherParticipants: [string]` — a **single-element tuple**
  (`packages/api/src/resources/messages.ts:52`, `apps/web/src/api/messages.ts:93`). Web
  (`MessagesPage.tsx:403`) and mobile (`app/conversation/new.tsx:58`) each pass exactly one id. So
  no group conversation can be created through the product at all.

**The real blocker is `participant_key`.** It is `",".join(sorted(set(ids)))` with a **unique**
constraint, used for idempotent 1:1 lookup. For groups that means:

- two different groups can never have the same member set (a coach cannot have "B2 Tuesday" and
  "B2 Tuesday — logistics" with the same eight people);
- adding or removing a member rewrites the conversation's identity key, and can collide with an
  existing conversation that already has that member set.

So groups need `participant_key` to become nullable/1:1-only, with group conversations identified by
id — not a UI change, a schema and lookup change.

### Touch points

- `conversations.participant_key` → nullable, unique only for 1:1 (partial index on `is_group = false`);
  `create_conversation_service` branches: 1:1 keeps find-or-create, group always creates.
- Accept and persist `groupName`; add participant add/remove endpoints + a `ConversationParticipant`
  lifecycle (`left_at`, or hard delete).
- Widen `otherParticipants` to `string[]` in `packages/api` and both apps; multi-select in the
  new-conversation screens; group avatar/header/title rendering in the conversation list and detail.
- Decide who may create a group (coach-only is the safe first cut, and it composes with §4 — student
  groups should wait on connections).
- **Adjacent bug to fix while there:** `Conversation.last_read_by()`
  (`models/conversations.py:42`) compares `p.id == user_id` — that is the *participant row* id, not
  the user id. It is called by `serialize_conversation_detail()`
  (`serializers/conversation.py:46`), so per-message read state in the detail view is computed from
  the wrong participant (or `None`). Group read-tracking would make this much more visible.

---

## 6. How can a coach add another coach's student?

**Today: they cannot — and the spec claims they can.**

`specs/players/spec.md:379` (`players.add-existing`, `status: implemented`) documents
`POST /api/app/coach/player` with a player_id, creating a second `coach_in_player` association.
**That route does not exist.** No `coach/player` route in `padel_app/modules/`, and the only
`Association_CoachPlayer(...)` construction sites are `player_service.py:45,99`,
`player_invitation_service.py:47` and `import_service.py:313` — all of which create a **brand-new
User + Player** first. (PAD-92 removed a batch of unauthenticated raw-entity routes; whether this one
was ever implemented or the spec was aspirational, the net today is the same.)

Consequences:

- The second coach's only option is to create a duplicate person, who then has a second User account
  and a second login.
- The duplicate-name warning does not even fire across coaches: `check_field_available` scopes the
  `("user","name")` warn-check to the calling coach's own roster by design
  (`frontend_api.py:1225-1229`, to avoid cross-club false positives). So the coach adds the duplicate
  in silence.
- Everything roster-derived then forks: evaluations, level history, attendance, notes, and the
  student's own app shows two unrelated coaching relationships.

### Touch points

- `POST /api/app/coach/player` (or better, the token flow in §7 — see below): create
  `Association_CoachPlayer(coach_id=<caller>, player_id, level_id, side)` if absent, plus
  `Association_PlayerClub` for the coach's current club; 409/no-op if the relation exists.
- **Consent is the design question.** A coach unilaterally attaching an existing student to their
  roster grants them that student's attendance, evaluations and DM access. The student should
  approve — which is exactly what §7's QR/join-token gives you.
- Player search across coaches: `player_search` today is deliberately roster-scoped
  (`specs/notifications/spec.md:462`, rule 8). A cross-roster search is a privacy widening and needs
  its own decision — the token flow avoids needing it at all.
- `specs/players/spec.md` §`players.add-existing` must be corrected. Note that `specs/` is **not
  under git** (umbrella dir is unversioned), so this cannot be fixed by a commit — the corrected
  rules have to be reproduced in the ticket/PR body.

---

## 7. Invite by coach, and a QR code for students who already have an account

### Today

The **only** invite mechanism is `PlayerInvitation`
(`padel_app/models/player_invitation.py`, spec `players.invite-completion`):

1. Coach creates an *incomplete* player — `POST /api/app/incomplete_player` (`frontend_api.py:1041`)
   creates a User with status `inactive` and a `pending-<random>` placeholder username.
2. A single-use, 7-day, `secrets.token_urlsafe` token is issued; the coach shares
   `/invite/player/<token>`.
3. The student opens `PlayerInvitePage.tsx`, **chooses a username and password**, and
   `POST /player-invitations/<token>/accept` activates the account and returns a JWT.

That is exclusively an **account-creation** flow. It is bound to a Player row the coach pre-created,
and accepting it *sets* credentials. For a student who already has a LevelUp account there is no
path at all — accepting would try to overwrite their identity, and the link is a plain URL besides.
No QR code exists anywhere in the repos — `grep -ril "qrcode|qr_code|qr-code|barcode-scanner"` across
`levelup_backend/padel_app`, `apps/web/src`, `apps/mobile/{app,src}`, `packages/`, both
`package.json`s and `specs/` returns 0 hits.

### The reframe: §6 and §7 are one gap seen from two sides

Both need the *same* missing backend capability — **link an existing Player to an additional Coach**
— differing only in who initiates. A QR is the better initiator because it carries the student's
consent implicitly (they scan and confirm while authenticated as themselves).

### Touch points

- **New model `CoachJoinToken`** (`coach_id`, `token`, `expires_at`, optional `max_uses`/`uses`,
  `is_active`). Unlike `PlayerInvitation` it is **not** bound to a player and is **reusable** — one
  QR on the coach's phone or clubhouse wall, scanned by many students.
- **Endpoints:** `POST /api/app/coach/join_token` (coach mints/rotates),
  `GET /api/app/coach/join_token/<token>` (public preview: coach name, club — so the student sees who
  they are joining before confirming), `POST /api/app/coach/join_token/<token>/accept`
  (**`@jwt_required()`** — the acting student is taken from the JWT, never the body) → creates
  `Association_CoachPlayer` + `Association_PlayerClub`, idempotent, 409 if already on the roster.
- **Unauthenticated scan** should fall through to `/auth` with a redirect back to the accept screen,
  so one QR serves both "already have an account" and "new here" — the latter landing on registration
  and then the same accept call.
- **QR rendering** is client-side only (`qrcode.react` on web, `react-native-qrcode-svg` on mobile);
  the backend just returns the token/URL. Mobile also needs camera scanning
  (`expo-camera` / `expo-barcode-scanner`) plus an iOS camera-permission string — that is an
  App Store metadata change, so budget for it.
- **Security:** rotate/revoke, short-ish expiry, rate-limit accepts, and treat the token as a
  *capability to join*, never as an authentication credential.
- **Specs:** new `players.coach-join-token` leaf; correct `players.add-existing` in the same pass.

---

## 8. Eligibility — design assessment (2026-08-06)

The proposed model: **eligibility is the minimum bar to join a class at all**; a *standard*
eligibility is set in Definitions/Settings and can be **overridden** per class or per recurring
group; nothing defined ⇒ everyone eligible; it gates both what students **see/can request** and who
**gets notified**; priority groups only *order* students who are already eligible.

The model is sound and most of the machinery to build it already exists. Four things need deciding
before anyone writes code, and the first one is load-bearing.

### 8.1 "Priority groups are already built" — they aren't; they're the eligibility layer

This is the crux. In the code, `invitation_groups` is **not** a priority mechanism. It is a
*sequence of eligibility filters consumed as widening rounds*:

- `_send_invitation_batch` (`:2012`) invites the matches of group **1**;
- when that round is exhausted, `_advance_round` (`:2109`) moves to group **2**, then group **3**,
  whose default is `{"rules": []}` — i.e. *everyone*;
- ordering **within** a round comes from a different config field entirely: `priority_criteria` +
  `tiebreakers`, applied by `_build_sort_key` (`:301`).

So the thing that orders eligible students (`priorityCriteria`/`tiebreakers`) *is* built and matches
the proposal. The thing called "invitation groups" is doing the eligibility job — but as a **ladder
of progressively looser bars**, not a single bar.

Under the proposed model that object has to split in two, and the widening-rounds behaviour must go
somewhere or coaches lose progressive fallback (today, a spot that nobody at the right level takes
eventually gets offered to the whole roster — that is deliberate, and it is how classes actually get
filled).

> **Decision 1 — do invitation rounds survive, and in what form?**
> Recommendation: rounds become **widening subsets *of the eligible set*** — eligibility is the
> outer bar nobody crosses, rounds stay as the "who do we ask first" escalation inside it. That
> keeps both concepts and makes today's round 3 legal again (it becomes "everyone *eligible*",
> not "everyone"). The alternative — drop rounds entirely — is simpler but changes fill behaviour
> for every existing coach.

This also settles the open question flagged in §2: with one eligibility bar, a waiting-list fill
checks *that bar*, and the "which round's rules?" ambiguity disappears.

### 8.2 "Nothing defined ⇒ everyone eligible" collides with a shipped bug fix, and with the defaults

Two separate problems, both fixable, both easy to get wrong:

**(a) PAD-86 fail-closed.** `effective_level_id()`'s docstring (`:160`) states that callers must
treat a missing level as *"nobody qualifies, never as no filter"* — that was a shipped fix, because
the permissive reading turned a level-only group into "invite the coach's entire roster". The
proposed default is that same permissive reading, promoted to a product rule. Both can hold, but only
if the states are kept distinct:

| State | Meaning |
|---|---|
| No eligibility rules defined at any tier | **Everyone eligible** (the proposed rule) |
| A level rule *is* defined, but the class has no level | **Nobody eligible** (PAD-86, unchanged) |

**(b) The current code cannot represent "unset".** `get_invitation_groups()`
(`notification_config.py:296`) returns a **non-empty** `DEFAULT_INVITATION_GROUPS` when the column is
`NULL`, so "never configured" and "configured to exactly level+side" are indistinguishable. A new
eligibility field must default to `NULL`/empty *meaning unset*, and the migration must map every
existing coach's `invitation_groups` explicitly — otherwise every current coach silently inherits a
level+side bar they never chose, which is the opposite of the stated default.

Minor but relevant while choosing that default: the **frontend and backend defaults already
diverge**. `InvitationGroupsSection.tsx:78` defaults to `one_above_vacancy` + side + `has_makeups`;
the backend (`notification_config.py:122`) defaults to `same_as_vacancy` + side. Pick one
deliberately.

### 8.3 "Payments up to date" does not exist as data

There is **no payments or billing model anywhere** in the backend — no table, no field, nothing in
`specs/`. The closest existing attribute, `subscription_status`, reads `User.status`, which is the
**account activation** enum (`inactive | active | disabled`) set by the invite/activation flow. A
coach who today picks "subscription is active" is actually filtering on *"has finished creating
their login"*. The same mislabel exists in the `excludeUnpaidSubscription` restriction.

So "payments up to date" is a **new capability**, not a new rule: it needs a payment-state field on
the coach↔player relation at minimum (manual toggle by the coach is a legitimate v1 — full billing
is a much bigger product). Whatever happens, the existing attribute should be renamed to say what it
really checks.

### 8.4 The three tiers map cleanly onto existing structures

| Tier | Where it lives | Precedent |
|---|---|---|
| **Standard** | `notification_config` (new `eligibility_rules` JSON column) | same shape/place as `invitation_groups`, `restrictions` |
| **Recurring group / master event** | `lessons` (new column) | `default_level_id`, `max_players`, `notifications_enabled` already live here |
| **Single class** | `lesson_instances` (new column) | `level_id`, `max_players`, `overwrite_title` already override the lesson here |

Resolution order is already an established pattern: `effective_level_id()` (`:160`) resolves
instance → parent lesson, and callers use it everywhere precisely so the fallback isn't
re-implemented per call site. An `effective_eligibility(instance)` helper should be written the same
way, with the same "one resolver, no ad-hoc fallbacks" discipline, plus the coach tier at the bottom.

**Two gotchas in the edit path:**

1. `edit_class_service` already dispatches `scope: "single" | "future"`
   (`lesson_service.py:748-844`), which is exactly the "this class / this and future classes" UX the
   proposal needs. But `scope: "future"` **splits the Lesson** — `_apply_future_edit_to_lesson`
   creates a *new* master from the edit date onward. So changing eligibility mid-series forks the
   series. That is the existing semantic for every other field; eligibility inherits it, and the UI
   copy should not promise otherwise.
2. `LessonInstance.overridden_fields` looks like the "this class overrides the standard" badge
   mechanism, but **no service ever writes it** — it is serialized out (`serializers/lesson.py:204`)
   and typed on the frontend, and populated by nothing. If the UI wants to show which tier a value
   came from, that is new work, not a stub to fill in.

### 8.5 What it affects — the two consumers

**Notifications** — mostly a rewiring of code that already exists:
- `_get_eligible_students_for_group` (`:505`) and `get_eligible_students` (`:564`) become
  "eligibility filter, then round subset, then sort".
- `_check_waiting_list` (`:2754`) gets the same bar — this is the §2 defect fixed at the root.
- `send_manual_notifications` (`:2560`) and the manual-notify modal groups (`:2952`) should show
  eligibility, since a coach hand-picking from an unfiltered roster bypasses the bar entirely today.
- `_passes_group_rules` (`:417`) is reusable as the evaluator almost verbatim; its `vacancy`
  argument would need to become "vacancy **or** class" so eligibility can be evaluated for a class
  with no vacancy open (which is what the student-facing list needs).

**Student visibility** — this is the part with no foundation. "Students only see and can request
classes for which they are eligible" is a filter applied to a list view that **does not exist**: a
student today sees only classes they are already enrolled in (§3). Eligibility and class discovery
are the same shipment — build eligibility alone and no student ever sees a difference.

### 8.6 Two more decisions

> **Decision 2 — does eligibility block a coach from *manually* adding an ineligible student?**
> House style says no: the availability-blocker precedent (`specs/calendar/spec.md:119`, rule 4)
> lets a coach add a blocked student *after confirming a warning*, because enrolment is a coach
> decision. Recommendation: mirror that exactly — eligibility hard-gates automatic invitations,
> waiting-list fills and student self-requests; it *warns* on manual add.

> **Decision 3 — what happens to already-enrolled students when the bar changes?**
> A coach tightening eligibility on a running series will have enrolled students who no longer
> qualify. Recommendation: eligibility governs *joining*, never *staying* — no auto-removal, no
> retroactive check. Worth a "3 enrolled students no longer meet this bar" note at save time so the
> coach isn't surprised.

### 8.7 Build order

1. `eligibility_rules` on `notification_config` + `effective_eligibility()` resolver + rewire the
   invite/waiting-list/manual paths. Ships correctness (fixes defects #1 and #2) with **no UI
   change**.
2. Per-lesson and per-instance columns + override editing on the existing `scope: single|future`
   path. Reuses the `InvitationGroupsSection` rule builder — the new work is tier/override chrome,
   not the editor.
3. Student discovery + request flow (§3), gated by eligibility. Only now does any of it become
   visible to students.
4. Payment state, if "payments up to date" is to mean what it says.

---

## Cross-cutting summary

**Defects found while reading (independent of any new feature):**

| # | What | Where |
|---|---|---|
| 1 | Waiting-list matching applies **no** level/side/absence filter for the default config, because `get_invitation_groups()` defaults non-empty | `notification_service.py:2769` |
| 2 | Waiting-list fill ignores `excludedPlayers`, `excludeUnpaidSubscription`, availability blockers, enrolment and presence status — so **the student who cancels can be auto-"placed" into the very vacancy their cancellation created**: credit burned, `waiting_list_placed` message sent, real spot stranded, class silently runs one short | `:2754`, `:2840`, `:3032` |
| 3 | `waiting_list_offer` messages have no Yes/No in either client, and `respond_waiting_list` has no caller — the self-service join path is dead | `MessageBubble.tsx:56`, mobile `message-bubble.tsx:134` |
| 4 | `Conversation.last_read_by()` compares participant-row id to user id → wrong per-message read state | `models/conversations.py:42` |
| 5 | `specs/players/spec.md` §`players.add-existing` documents a route that does not exist, as `implemented` | `specs/players/spec.md:379` |
| 6 | **PAD-107 is specced but never landed.** `grep -rn "PAD-107" levelup_backend/padel_app/` → 0 hits; no `availability_conflicts` endpoint; no blocked-skip in `/notify/manual` or `/send_reminders`; no delivery backstop in `_send_system_message`. Only PAD-28 (eligibility-time blocker filtering) shipped, yet `specs/calendar/spec.md` rules 4, 8, 9, 10, 11 read as implemented | `specs/calendar/spec.md:119-126` |

**Rough build order if all of this is wanted:** (1) the eligibility layer of §8, phase 1 — one bar,
resolver, rewired invite/waiting-list/manual paths; it subsumes the §2 fix and defects #1 and #2;
(2) per-class / per-recurrence eligibility overrides (§8 phase 2); (3) the coach join token —
unblocks both §6 and §7 with one model; (4) student class discovery + join requests, gated by
eligibility — the largest, and the one that most changes the product's shape; (5) connections +
student↔student DM; (6) named group chats.

**Open decisions that block spec work** (all in §8): whether invitation *rounds* survive as widening
subsets of the eligible set; whether eligibility hard-blocks a coach's manual add or only warns; what
happens to already-enrolled students when the bar tightens; and whether "payments up to date" means
building payment state or renaming the existing activation-status attribute.
