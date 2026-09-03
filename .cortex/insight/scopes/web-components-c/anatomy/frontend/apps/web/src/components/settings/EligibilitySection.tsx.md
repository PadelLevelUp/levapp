---
path: frontend/apps/web/src/components/settings/EligibilitySection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 3
size_lines: 260
size_tokens: 2273
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3f30c85653c2109e661e7df3597bdbd7bfdfb4b6e547c6633f958c5f50ff0763"
---

## Purpose

`EligibilitySection` (PAD-128) is the coach's editor for the standing eligibility bar: the minimum criteria a player must meet to join a class at all, evaluated per-class rather than per-vacancy. It reuses the same attribute/operation/value rule-builder shape as `InvitationGroupsSection` but deliberately restricts the attribute set, per its own doc comment: no `side` (side stays an invitation-ordering criterion, never a permission gate), no payment/subscription attributes (no payment state exists to read — the existing `subscription_status` invitation-group attribute and the `excludeUnpaidSubscription` restriction both actually read account activation), and level operations anchored to the class's own level rather than to a specific vacancy, since the bar must be answerable even when no spot is open.

## Main players

- `ELIGIBILITY_ATTRIBUTES` (lines 24–68) — critical. The config array driving the whole rule builder: four attributes (`level`, `unjustified_absences`, `justified_absences`, `attendance_rate`), each with its allowed operations and a `valueType` (`conditional-number` | `number` | `percentage`). `level`'s `within_n_of_class` operation is the only one that both needs a numeric value and is conditional on the chosen operation (`valueForOperations`).
- `needsValue(attr, operation)` (lines 70–76) — supporting. Resolves whether the currently-selected operation for an attribute should show a value input; encodes the `conditional-number` special case.
- `RuleRow` (lines 78–178) — critical. Renders one rule: attribute `Select` → operation `Select` (options depend on the chosen attribute) → optional value `input` (percentage suffix when `valueType === "percentage"`) → remove button. Selecting a new attribute resets `operation` to that attribute's first option and clears `value`.
- `EligibilitySection` (lines 187–259) — critical. The exported component. Treats `rules == null || rules.length === 0` as "no bar — everyone eligible" (`data-testid="eligibility-open-bar"` empty state) versus a non-empty rule list rendered as one card with all rules ANDed together (`allRulesApply` hint text). Removing the last rule sets `rules` back to `null` rather than leaving `[]`, treating the two as equivalent at this tier but preferring `null` as the "honest" unset representation.

## Insights

`rules: GroupRule[] | null | undefined` is a tri-state prop where `null`/`undefined`/`[]` are all rendered as "no bar", but the component actively normalizes empty-after-removal back to `null` (never emits a lingering `[]`) — a convention worth preserving if this component is touched, since callers/serializers may rely on `null` specifically meaning "unset" versus an explicit empty array meaning something else upstream. The attribute list is a intentionally-narrower fork of `InvitationGroupsSection.AVAILABLE_ATTRIBUTES`, not a shared constant — the two rule builders will drift independently by design (eligibility is a floor, invitation groups are an ordering on top of it), so a new shared attribute (e.g. a new absence metric) must be added to both files by hand, and a change made to one must not be assumed to apply to the other.

## Connections

Uses:
- `@/components/ui/{button,select}`: the rule-row Select/Button primitives.
- `@/types` (`GroupRule`): the same rule shape (`attribute`/`operation`/`value`) shared with `InvitationGroupsSection`.

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Eligibility" collapsible section, positioned above "Invitation Groups" in that file's UI — per that file's own comment, eligibility is the floor and invitation groups are an ordering layered on top of it, not a second permission system.

## Query pointers

If you need to add a new rule attribute (e.g. a new absence or performance metric) to eligibility, also check whether `InvitationGroupsSection.tsx`'s `AVAILABLE_ATTRIBUTES` needs the equivalent addition — the two lists are intentionally separate and do not stay in sync automatically.
If you need to understand why eligibility and invitation groups are two separate concepts rather than one, read the doc comment at the top of this file and `NotificationsEngineSection.tsx`'s inline comment above the Eligibility `Collapsible`.
