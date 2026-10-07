---
id: admin.clubs-and-switches
status: draft
depends_on: [admin.foundation, clubs.crud, clubs.courts, clubs.membership, auth.coach-approval, eligibility.open-spot-visibility]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-003, R-004, R-005, R-022]
---

# admin.clubs-and-switches

> Linear: PAD-533 (this spec), epic PAD-530; builds on PAD-531 (`admin.foundation`). Owner
> decisions 2026-10-06. Draft: no code exists.

### Intent
Let staff fix clubs, their courts and the coach↔club links without the database, and hold every
platform-wide switch in one console page: the coach-approval gate (today a switch in the coach
app's Settings → Admin) and a kill-switch per client capability, so a misbehaving feature can be
switched off for everyone without a release. Every change is audited (`admin.foundation` rule 8).

### Entities
- **READS / WRITES:** Club (`clubs`: name, description, location), Court (`courts`, per
  `clubs.courts`), `coach_in_club` (Association_CoachClub), `player_in_club` (read only)
- **READS / WRITES:** AppSetting (`app_settings`: `key`, JSON `value`, `updated_at`,
  `updated_by_user_id`) through `services/app_settings_service.py` — keys
  `coach_approval_required` (existing) and `capability_kill_switches` (new key, no migration: the
  table already holds arbitrary keys)
- **READS:** the capability registry in `utils/client_capabilities.py` (`HEADER =
  "X-LevApp-Capabilities"`, the declared capability constants, `client_declares()`)

### Rules
1. **Clubs.** `GET /admin/api/clubs?q=` (`support`) lists clubs by name with counts of coaches,
   players, courts and lessons, 50 per page. `GET /admin/api/clubs/<club_id>` (`support`) adds the
   courts in order and the linked coaches. `PATCH /admin/api/clubs/<club_id>` `{name?,
   description?, location?}` (`operator`) edits those fields with `clubs.crud`'s validation. The
   console never creates or deletes a club (deletion cascades to lessons, R-003).
2. **Courts.** `POST /admin/api/clubs/<club_id>/courts` `{name}`,
   `PATCH /admin/api/courts/<court_id>` `{name}`, `DELETE /admin/api/courts/<court_id>` and
   `PUT /admin/api/clubs/<club_id>/courts/order` `{ids}` (`operator`) call the same service
   functions as the coach routes of `clubs.courts` rules 3–5, with the same validation, uniqueness
   and the same effect on classes that carry the court (`court_id` set to null on delete). The
   staff member needs no club membership.
3. **Coach↔club links.** `POST /admin/api/clubs/<club_id>/coaches` `{coachId}` adds a
   `coach_in_club` row; `DELETE /admin/api/clubs/<club_id>/coaches/<coach_id>` removes it
   (`operator`). Adding an existing link is 200 with no change; removing a coach's last club link
   is allowed and answers `{"warning": "COACH_HAS_NO_CLUB"}`. Removing a link never deletes the
   coach's lessons, players or the club's data; lessons stay scoped to their club (R-003). The
   `coach.current_club` rule of `clubs.crud` (most recently joined) applies to the result.
   Audited as `club.coach_link` / `club.coach_unlink` with the coach and club in `after`.
4. **Coach-approval gate.** (Shipped early by PAD-532, `admin.approvals-and-users` rule 10b, so
   the switch never lives only in the database.) `GET /admin/api/settings/coach-approval` (`support`) answers
   `{coachApprovalRequired, source}` exactly as `GET /api/app/admin/settings` does today
   (`auth.coach-approval` rule 9: `source` = `database` | `environment`).
   `PUT /admin/api/settings/coach-approval` `{coachApprovalRequired}` (`operator`) calls
   `set_coach_approval_required()`. The setting's semantics are unchanged: flipping it never
   changes an existing coach's `approval_status`. `updated_by_user_id` is the staff member's
   linked product user or null; the audit row is the attribution.
5. **Capability kill-switches.** The `app_settings` key `capability_kill_switches` holds
   `{"<capability>": {"off": true, "reason": "<text>"}}` for capabilities switched off; an absent
   key or an absent capability means on. `client_declares(capability)` answers false for a
   capability that is switched off, whatever the client's `X-LevApp-Capabilities` header says, so
   the server withholds the feature exactly as it does for a client that never declared it (the
   fail-closed path the feature already has). The value is read through a cache of at most 30
   seconds per worker, so a switch takes effect everywhere within 30 seconds without a restart.
6. **Switch screen.** `GET /admin/api/settings/capabilities` (`support`) lists every capability in
   the registry with its on/off state, reason, and when and by whom it was last changed (from the
   audit log). `PUT /admin/api/settings/capabilities/<capability>` `{off, reason}` (`owner` only; the coach-approval gate of rule 4 stays `operator`)
   sets one; `reason` is required (at least 5 characters) when switching off. An unknown
   capability is 404. Audited as `capability.switch` with the previous and new state.
7. **The old settings routes go.** (Done by PAD-532, rule 10b there.) `GET|PUT /api/app/admin/settings` and the
   switch at the top of the product's Settings → Admin are removed (404), on web and iOS, as part
   of the section's removal by `admin.approvals-and-users` rule 10; the removed test ids
   (`admin-coach-approval-required`, `admin-coach-approval-required-switch`,
   `admin-coach-approval-source-env`) and `apps/web/e2e/settings/admin-coach-approval-switch.spec.ts`
   are replaced by console tests.

### Acceptance Criteria

#### Staff edit a club and its courts without being a member (rules 1, 2)
- **Given** club `Padel Norte` with courts `Court 1`, `Court 2` and an `operator` token
- **When** the operator renames the club, adds `Court 3`, deletes `Court 2` and reorders to `[3, 1]`
- **Then** the club's name is changed, the courts read `Court 3`, `Court 1`, a class that carried `Court 2` now has `court_id` null (an occurrence falls back as `clubs.courts` rule 4 says), and four audit rows exist with before and after

#### Court validation matches the coach routes (rule 2)
- **Given** a club that already has `Court 1`
- **When** an operator adds another `Court 1`
- **Then** the response is the coach route's 400 `{"code": "invalid_court"}`, and an audit row with `outcome = error` exists

#### Staff link and unlink a coach (rule 3)
- **Given** coach `maria` linked to club A only, and club B
- **When** an operator links `maria` to B, then unlinks her from A, then unlinks her from B
- **Then** after the first call `maria.current_club` is B; her lessons in A still exist and are still scoped to A; the last call answers `{"warning": "COACH_HAS_NO_CLUB"}`

#### The approval gate moves without changing meaning (rule 4)
- **Given** no `coach_approval_required` row and the environment default
- **When** support GETs `/admin/api/settings/coach-approval`, and an operator PUTs `{coachApprovalRequired: false}`
- **Then** the first answers `{coachApprovalRequired: true, source: "environment"}`; after the PUT a coach who self-registers is created `approved`, existing pending coaches stay `pending`, and an audit row `settings.coach_approval` holds `before = true`, `after = false`

#### Support cannot flip a switch, operators cannot flip a kill-switch (rules 4, 6)
- **Given** a `support` token and an `operator` token
- **When** support PUTs either switch, and the operator PUTs a capability kill-switch
- **Then** all three are 403 and nothing changed

#### A kill-switch withholds a capability from every client (rule 5)
- **Given** `open-spots` switched on, a student request declaring `X-LevApp-Capabilities: open-spots`, and a visible class with room
- **When** an owner switches `open-spots` off with reason "B-xxx incident", and the student reads the calendar after the cache window
- **Then** the response contains no open spot, exactly as for a client that never declared it; switching it back on restores the open spot

#### The cache bounds the delay (rule 5)
- **Given** a worker that read the switches at time T
- **When** the switch changes at T + 1 s and the worker answers at T + 31 s
- **Then** that answer reflects the change

#### Switching off needs a reason; unknown capabilities are refused (rule 6)
- **Given** an owner token
- **When** it PUTs `{off: true}` with no reason, and PUTs to `/capabilities/no-such-thing`
- **Then** the first is 400 and the second 404, and nothing changed

#### The product's admin settings routes are gone (rule 7)
- **Given** a product superadmin token
- **When** it calls `GET /api/app/admin/settings`
- **Then** the response is 404

### Not this spec
- Creating or deleting clubs, merging duplicate clubs, editing club logos.
- Membership of players in clubs (read only here).
- Adding new client capabilities, or what each capability does — each capability is specified with
  its feature (for example `eligibility.open-spot-visibility` rule 12).
- Per-coach engine settings — read-only in `admin.engine-health`.
- Plans and entitlements — `admin.commercial-groundwork`.

### Notes
- Linear: PAD-533. Epic PAD-530. Depends on PAD-531.
- The capability mechanism today is client-declares, server-withholds (PAD-352,
  `utils/client_capabilities.py`); rule 5 adds the server-side "off" without changing the header
  or any client.
- Decision 2026-10-07 (coordinator default, confirmed): capability kill-switches are `owner`-only.
- Note: some capabilities guard protocol compatibility (an old client must not receive a shape
  it cannot read) rather than a feature; switching those off is safe (it is the old-client
  path) but may hide a feature from every client. The switch screen should say so per capability;
  the wording is left to PAD-533.
