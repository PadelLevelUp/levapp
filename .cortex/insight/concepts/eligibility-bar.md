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
