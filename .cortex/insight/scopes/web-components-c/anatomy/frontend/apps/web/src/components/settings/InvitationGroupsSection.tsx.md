---
path: frontend/apps/web/src/components/settings/InvitationGroupsSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 3
size_lines: 440
size_tokens: 3355
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8788ba560c5e918bb6da5c7de22bc3b60c254394ce473f1939b2891444f396ca"
---

## Purpose

`InvitationGroupsSection` is the coach's editor for the ordered "waves" of invitation groups the automatic invitation engine works through when a vacancy opens: a drag-reorderable list of `GroupCard`s, each an AND-ed set of rules (attribute/operation/value) evaluated against the vacancy, tried in order until enough players accept. Unlike `EligibilitySection`'s single floor, groups here are a *sequence* — the list order is the actual priority order the engine invites in, and the last group getting non-empty rules triggers a hint that anyone not matching any group is never automatically invited.

## Main players

- `AVAILABLE_ATTRIBUTES` (lines 8–78) — critical. Seven invitation-ordering attributes: `level` (vacancy-relative operations like `one_above_vacancy`/`same_as_vacancy`, unlike `EligibilitySection`'s class-relative ones), `side`, `has_makeups`, `unjustified_absences`, `justified_absences`, `attendance_rate`, `subscription_status` (a `valueType: "select"` attribute with `valueOptions`, the one value shape not present in `EligibilitySection`'s attribute set).
- `DEFAULT_INVITATION_GROUPS` (lines 80–137) — critical. The 8-group seed sequence auto-applied the first time a coach turns on automatic notifications from an empty state (see `NotificationsEngineSection`'s master-toggle handler) — an explicit, ordered "level+side match, with/without makeup priority, widening" cascade.
- `RuleRow` (lines 139–246) — supporting. Structurally identical to `EligibilitySection.RuleRow` (attribute/operation/value Select trio) but independently implemented against `AVAILABLE_ATTRIBUTES`, including the `select`-typed value case `EligibilitySection` doesn't need.
- `GroupCard` (lines 248–354) — critical. One draggable group: header with position number, rule list, add-rule button, and a remove-group button gated on `totalGroups > 1` (the last remaining group cannot be deleted).
- `InvitationGroupsSection` (lines 362–439) — critical. Owns drag-reorder state (`dragIdx`), group CRUD, and the "last group has rules" hint; caps the list at 10 groups (`groups.length < 10` gates the add button).

## Insights

The rule-builder shape (attribute → operation → value) is duplicated verbatim between this file and `EligibilitySection.tsx` — same `RuleRow` pattern, same `GroupRule` type — but the two `*_ATTRIBUTES` constant arrays are deliberately different lists and not extracted into a shared constant, because they answer different questions: this file's `level` attribute is relative to the open vacancy (`one_above_vacancy`), while `EligibilitySection`'s `level` attribute is relative to the class itself (`equal_or_above_class`) since eligibility must be answerable with no vacancy open. A future refactor merging the two rule builders needs to preserve that vacancy-relative vs class-relative distinction, not just the shared UI shape. Groups are capped at 10 (hardcoded `groups.length < 10`), with no visible affordance explaining the cap to the coach.

## Connections

Uses:
- `@/components/ui/{button,select}`.
- `@/types` (`InvitationGroup`, `GroupRule`): the same `GroupRule` shape `EligibilitySection` uses.

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Invitation Groups" collapsible, and separately imports `DEFAULT_INVITATION_GROUPS` to seed a first-time coach's config when they flip on automatic notifications with no groups configured yet — a two-second `setTimeout` delay plus a `groupsInitializing` loading state simulates the setup before applying the defaults.

## Query pointers

If you need to change what a "vacancy" attribute can match on, edit `AVAILABLE_ATTRIBUTES` here — but check whether the equivalent change belongs in `EligibilitySection.tsx`'s `ELIGIBILITY_ATTRIBUTES` too (they're related but not identical; eligibility is class-relative, invitation groups are vacancy-relative).
If you need to change the first-time-setup default groups, edit `DEFAULT_INVITATION_GROUPS` here; the consumer of it, `NotificationsEngineSection.tsx`, controls *when* it's applied (only on the automatic-notifications master toggle's off→on transition with an empty group list), not what it contains.
