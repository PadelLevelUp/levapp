---
id: settings.tutorials
status: implemented
depends_on: [settings.role-scope, notifications.invite-simulation, calendar.view, classes.instances]
implements: ../../specs-business/notifications/coach-understands-who-gets-invited.business.md
governed_by: [R-001, R-011, R-012, R-015, R-024]
---

# settings.tutorials


### Intent
A coach-only Settings section, **Tutorials**, that hosts interactive walkthroughs of the app's
non-obvious behaviour. Its first (and, in v1, only) tutorial is **Understand invites**: pick a
class, pick the player who "cancels", read exactly who the engine would invite and why, and ask
about anyone who is missing. Web and iOS ship it together (R-024).

### Entities
- **READS:** the coach's upcoming classes (the existing calendar feed), a class instance's enrolled
  players, the simulation and explain responses of `notifications.invite-simulation`, the player
  search of `notifications.waiting-list` rule 7.
- **WRITES:** nothing. Selecting a non-materialized occurrence materializes it through the
  sanctioned path (rule 3), which is the same side effect opening the class has.

### Rules
1. `tutorials` is added to the **single section registry** of each app — web `SettingsPage.tsx`
   with `audience: "coach"`, mobile `settings-sections.ts` also with `audience: "coach"`
   (PAD-169 replaced mobile's `COACH_ONLY_SECTIONS` list with the same field web uses) — placed
   directly after **Notifications**. Students never see it (`settings.role-scope` rules 2–5); no
   backend endpoint is added by this leaf, so the authorization boundary is the simulation's own
   `require_coach()`.
2. The section lists tutorials as rows (title + one-line description). v1 has exactly one row,
   **Understand invites**. The list is a static registry in code, mirrored on both apps, not
   server data.
3. **Understand invites** is a three-step flow on one screen:
   - **Pick a class** — the coach's upcoming classes for the next 4 weeks, read from the existing
     calendar feed (`calendar.view`), including non-materialized occurrences, filtered to those
     with at least one enrolled player. Selecting an occurrence resolves it to a `LessonInstance`
     through `get_or_materialize_instance` (R-001, `classes.instances` rule 1), exactly as opening
     the class does — the tutorial never creates instance rows any other way.
   - **Pick the missing player** — the enrolled players of that instance.
   - **Results** — fetched from `POST /api/app/notify/invite_simulation` through `@levelup/api`
     (R-012); never a direct HTTP call from a component or screen.
4. Results render in this order, mirroring the engine's own order:
   1. **Gates**, blocked ones first, each in plain words with the moment it clears when the
      response gives one ("The engine is switched off", "Quiet hours — invitations resume at
      07:00", "Invitations open at 16:00", "This class is too close to start").
   2. **Approval note** when `approvalRequired` — "You would be asked to approve this list first".
   3. **Waiting-list line** when `waitingListPlacement` is present — "Dora would be placed directly
      from the waiting list; nobody is invited for this spot".
   4. **The spot** — side and level and where the level came from ("a left-side, level 5 spot —
      level taken from the player").
   5. **The rounds**, in order. Each round is headed by its rules rendered in words ("Same level
      and same side as the spot", "Same level", "Everyone eligible"). Each candidate row shows
      rank, name, level, side, the enabled priority values in the coach's configured order
      ("level: same", "attendance 92%", "justified misses 5%", "side: exact match"), and a
      send-status badge: **first batch**, **waiting**, or **over today's limit**. A round with no
      candidates says so explicitly rather than disappearing.
5. Below the rounds, a **"Why isn't … invited?"** search backed by the existing
   `GET /api/app/notify/player_search`; picking a result calls the explain endpoint. The verdict
   renders as **one sentence for the stage**, and when the stage is `eligibility` the structured
   failure records render through **one shared, platform-neutral formatter**
   (`@levelup/config` `describeEligibilityFailure`, record → locale key + params) that both shells
   call — the tutorial and the PAD-133 manual-add warning (`eligibility.enforcement` rule 7) must
   say the same thing about the same student. Neither app had a renderer for those records before
   this leaf; the warning adopts this one when it is built. A student who *is* invited gets "Invited in round 2, position 3 —
   waiting" rather than a reason.
6. All copy lives in a new i18n namespace **`tutorials`** in both languages (pt, en). On mobile
   the namespace must be **statically imported** in `src/lib/i18n.ts` — the static-import trap in
   `frontend/CLAUDE.md` — or every string renders as its key. Every `stage`, gate `code`,
   `sendStatus` and priority key from the simulation has a translation entry; an unknown code
   renders a neutral fallback, never the raw code.
7. Web uses the shadcn primitives (R-015) and `@/` imports (R-011). iOS mirrors the drill-in
   pattern of the existing settings sections (section list → section → tutorial) and carries a
   `testID` on the section row, each step's picker and the results container for Maestro.
8. Changing the class resets the player step and clears the results; changing the player re-runs
   the simulation; the results header shows `evaluatedAt` as "as of HH:MM" in the club timezone.
   A simulation in flight is replaced, not appended, when the selection changes.
9. The tutorial explains; it does not act. It offers no button to send, approve, place or exclude
   anyone. Links to the relevant Settings → Notifications sections are allowed.

### Acceptance Criteria

#### Coach sees Tutorials, student does not — web
- **Given** an authenticated coach on `/settings`
- **When** the section list renders
- **Then** **Tutorials** is offered directly after **Notifications**
- **And** an authenticated student on `/settings` is not offered it, and opening
  `/settings?tab=tutorials` as a student falls back to a permitted section

#### Coach sees Tutorials, student does not — iOS
- **Given** an authenticated coach on the Settings tab
- **When** the section list renders
- **Then** a row with `testID="settings-nav-tutorials"` is offered after Notifications
- **And** for an authenticated student that row is absent

#### Picking a class then a player shows the ordered rounds
- **Given** a coach with `maxSimultaneous` enabled at 2 and an upcoming class "Terça 19:00" with
  enrolled players Alice, Bob and Carol, and five eligible students on the roster
- **When** the coach opens Tutorials → Understand invites, picks "Terça 19:00", then picks Alice
- **Then** the results show the spot line, then round 1 with its candidates numbered from 1
- **And** the first two candidates carry the **first batch** badge and the rest carry **waiting**
- **And** neither Alice, Bob nor Carol is listed

#### A blocked gate is shown above the queue
- **Given** the coach has `quietHours` enabled and the tutorial is run at 22:30 club-local
- **When** the results render
- **Then** a gate line "Quiet hours — invitations resume at 07:00" appears above the rounds
- **And** the rounds are still listed below it

#### The lookup explains a student below the bar
- **Given** the coach's bar is `[{level, within_n_of_class, value: 1}]`, the class is level `4`,
  and Eve is level `5-` (two steps away)
- **When** the coach types "Eve" in "Why isn't … invited?" and picks her
- **Then** the verdict says she is below the eligibility bar
- **And** the failed rule renders as "2 levels below this class", identical to what the manual-add
  warning shows for Eve on this class

#### The lookup explains an invited student's position
- **Given** the simulation lists Hugo third in round 1 with `sendStatus` `queued`
- **When** the coach looks Hugo up
- **Then** the verdict reads "Invited in round 1, position 3 — waiting"

#### Switching class clears the results
- **Given** results are showing for "Terça 19:00" / Alice
- **When** the coach picks a different class
- **Then** the player step is reset, the results area is empty, and no simulation runs until a
  player is picked

#### The tutorial changes nothing
- **Given** a coach in semi-automatic mode runs the tutorial for a class
- **When** they later open the Assistant conversation and the class's notification activity
- **Then** no approval prompt, invitation or activity entry was created by the tutorial

### Notes
- The Tutorials section is deliberately a registry so the next tutorial is one row and one
  screen, not a new Settings section.
- The class picker reuses the calendar feed rather than a new endpoint: the tutorial's "upcoming
  classes" must be the same classes the coach sees on their calendar.
- OPEN: the copy for each gate, stage and badge is drafted at plan time in pt first
  (`settings.language` rule: Portuguese is the default and the fallback).
