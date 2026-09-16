---
id: decision.2026-09-10-data-model-audit-follow-up
title: Data-model audit follow-up — every open finding has a ticket, the alternatives are on record
date: 2026-09-10T01:00:00Z
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/summary.md
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
---

# Data-model audit follow-up — every open finding has a ticket, the alternatives are on record

PAD-188 asked for the 2026-09-02 data-model audit to be re-read against `staging`
(58e7ab0, 2026-09-10) and for every finding that was still open and un-ticketed to get
a Linear ticket with `file:line` evidence and a priority, or a written reason why not.
This entry records the outcome so nobody re-reads the audit to find out what was done
with it.

## Already closed or in flight before this pass

H2 (PAD-206), H3 (PAD-227, in progress), H10 (PAD-204, PAD-208), the conversation half
of H6 (PAD-203, PAD-204), the roster/club dumps (PAD-205), M6 (PAD-207), the generic
CRUD routes of M9 (PAD-88), the training IDOR of H1's class (PAD-115), the public
bucket half of M10 (PAD-197), the divergent-time duplicate of H8 (PAD-85, in code),
the drift gate half of H13 (PAD-220, in progress), the Supabase remnant of §13
(PAD-177).

## Tickets filed on 2026-09-10 (all children of PAD-188)

| Ticket | Findings | Priority |
|---|---|---|
| PAD-254 | C1 unauthenticated activation route | Urgent |
| PAD-255 | C2 level-delete cascade, H7 inviter FK | Urgent |
| PAD-256 | C3 what stored class times mean (decision needed) | High |
| PAD-257 | H1 cross-coach reads with PII | High |
| PAD-258 | H4 attendance/reminder writes without ownership | High |
| PAD-259 | H5 three enrolment stores | High |
| PAD-260 | H6 profile `user_id` nullable/non-unique, M14 profile uniques | High |
| PAD-261 | H8 locks and unique occurrence key | High |
| PAD-262 | H9 dashboard runs the calendar pipeline twelve times | High |
| PAD-263 | H11 FK index migration | High |
| PAD-264 | H12 scheduler starts inside migrations | High |
| PAD-265 | H13 heads gate, `include_object`, revision ids | Medium |
| PAD-266 | M3 `current_club` picks the oldest club | Medium |
| PAD-267 | M9 editor env-gate and redaction | Medium |
| PAD-268 | M10 account deletion completeness | Medium |
| PAD-269 | M11 token and secret hygiene | Medium |
| PAD-270 | M1 level history as source | Medium |
| PAD-271 | M4 vacancy reconciliation, M5 presence response enum | Medium |
| PAD-272 | M8/M8b request-scoped transactions, slimmer mixin | Medium |
| PAD-273 | M12/M13/M14 schema hygiene migration | Medium |
| PAD-274 | M15/M15b cascades and undo-less deletes | Low |
| PAD-275 | M1b/M2/M7 series identity and per-instance overrides | Low |
| PAD-276 | M17/M18 engine and scheduler cost | Low |
| PAD-277 | M19 SSE pins gunicorn threads | Medium |
| PAD-278 | M20 tests on Postgres | Medium |
| PAD-279 | M21 NotificationConfig columns | Low |
| PAD-280 | §13 naming and dead code | Low |

Grouping rule: findings that share a migration or a single code path share a ticket
(C2 with H7, M12 with M13 and M14, M15 with M15b, M1b with M2 and M7, M17 with M18).
Findings that need a product or data decision before code (C3) are a decision ticket,
not a fix ticket.

## Deliberately not ticketed

**M16 — unbounded growth, no retention.** The audit itself says nothing breaks from
volume for two to three years and that the real danger is unindexed scans, which
PAD-263 covers. A retention job needs a retention *policy* (how long messages,
notification events and blocklist rows live), and that is a product decision the
owner has not made. Revisit when PAD-268 (account deletion) settles what "gone" means,
or when any table passes a million rows, whichever is first.

**§15 leave-alone list.** The audit's list of things that are right and must not be
"fixed" stands unchanged: the User/Coach/Player split, `coach_in_player` as the student
record, lazy materialisation keyed on `(lesson_id, occurrence_date)`, Vacancy
snapshotting side and level, `ReplacementApprovalPrompt.queue_snapshot`, the
`participant_key` trick, CalendarBlock reused for student blockers, business rules in
services not ORM classes, the per-vacancy NotificationEvent ledger, secrets in env,
werkzeug scrypt, 256-bit invitation tokens, the explicit allow-list in
`update_own_profile_service`.

## Alternatives on record (audit §14)

**Accepted, carried into the tickets above:** Presence as the only per-occurrence
enrolment with `enrolment_source` (PAD-259); instance coaches derived from the lesson
with an optional `coach_override_id` (PAD-275); level history as source with the
junction column as cache (PAD-270); a real timezone model with edge conversion as an
acceptable interim (PAD-256); presence response enum plus `recorded_by` (PAD-271); the
reminder table (done, PAD-207); the editor split out of the ORM (PAD-272); the coach as
the stated tenant; index migration first (PAD-263); a single interval scheduler job
after the cheap fixes (PAD-276); Postgres in tests (PAD-278); CI heads gate and
generated revision ids (PAD-265); promoting typed NotificationConfig settings
(PAD-279); scoped SSE, per-user map first (done, PAD-206), Redis pub/sub before any
multi-academy rollout (PAD-277).

**Deferred:** a native-enum-vs-CHECK policy (no ticket; decide inside the first
migration that adds an enum, PAD-271 or PAD-273); a separate migration container
(PAD-264 removes the immediate hazard by not starting the scheduler; the container
split waits for the single-VM decision of 2026-08-25 to be revisited).

**Rejected, and stays rejected:** virtual occurrences plus an exceptions table
(materialised instances stay; PAD-275 adds `series_id` and `excluded_dates` instead);
collapsing Coach and Player into User (`/auth/me` returns both roles instead); the club
as tenant (only if academies ever share rosters — see the 2026-09-06 open-registration
decision for the current model).
