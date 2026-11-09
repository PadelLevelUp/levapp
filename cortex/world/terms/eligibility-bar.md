---
about: "The hard, per-coach admission gate evaluated *before* any invitation-group or round ranking criteria runs — \"may this student join this class at all\",…"
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/concepts/eligibility-bar.md@ef7a5f3
---

The hard, per-coach admission gate evaluated *before* any invitation-group or round ranking criteria runs — "may this student join this class at all", distinct from "who gets invited first" (that ordering question belongs to [[invitation-engine]]). Locked by PAD-128/129/133: eligibility fields are nullable-as-unset, evaluated on level and absence history only (never payments), and a failing rule warns a coach rather than silently blocking — the same warn-don't-block posture the web settings UI documents in its own rule-builder section.

## Implemented by
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/replacement_approval_service.py`
`backend/padel_app/tests/test_pad128_eligibility.py`
`backend/padel_app/tests/test_pad133_eligibility_reasons.py`
`frontend/apps/web/src/components/settings/EligibilitySection.tsx`
`frontend/apps/web/src/components/settings/InvitationGroupsSection.tsx`

## Related concepts
[[invitation-engine]]
[[semi-automatic-approval]]

(Merged text above: `.cortex/insight/concepts/eligibility-bar.md`.)

## Detail from `.cortex/insight/scopes/backend-services/concepts/eligibility-bar.md`

**Definition.** A hard, per-coach admission gate (PAD-128/129/133)
answering "may this student join this class at all?" — categorically
distinct from invitation-group/round CRITERIA, which only rank
already-admitted candidates. An unset or empty bar (`None` or `[]`)
means "everyone is eligible"; a defined-but-unsatisfiable bar is the
only state that means "exclude everybody" — callers must not conflate
the two. The bar is always evaluated FIRST, before group/round criteria,
at every candidate-selection site.

**Implementing files:**
- `backend/padel_app/services/notification_service.py` — `effective_eligibility`
  (the single resolver), `passes_eligibility` (bool check),
  `eligibility_failures`/`eligibility_failures_for_players`/
  `students_failing_eligibility_bar` (structured reason-reporting
  siblings), and `_group_rule_failures` (the shared rule evaluator
  behind both the bar and invitation-group criteria — anchored on
  `vacancy=None` for the bar's `*_class` rule vocabulary vs. a real
  `Vacancy` for the `*_vacancy` vocabulary).
- `backend/padel_app/services/replacement_approval_service.py` —
  `compute_full_invite_queue` resolves eligibility through the same
  `notification_service` functions when snapshotting a semi-automatic
  approval prompt's invite queue.

**Related concepts:** [[level-ladder-position]] (level rules within the
bar/criteria evaluator compare LADDER POSITION, never raw
`display_order`), [[invitation-engine]] (the bar gates every wave of
invitations the engine sends).
