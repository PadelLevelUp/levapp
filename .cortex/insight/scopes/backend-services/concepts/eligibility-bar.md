---
concept: eligibility-bar
---

# Eligibility bar

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
