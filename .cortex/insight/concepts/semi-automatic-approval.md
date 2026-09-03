The coach-gated variant of a vacancy fill: under `invitationMode = semi_automatic`, marking a player absent during presence confirmation withholds automatic invitations and instead surfaces a coach-facing approval prompt — an inline card plus a persisted Assistant-conversation message — showing the declining student and the ordered invite queue, with a one-prompt-per-vacancy idempotency guarantee. It is a consent layer wrapped around the ranking [[invitation-engine]] already computes, not a replacement for it.

## Implemented by
`backend/padel_app/services/replacement_approval_service.py`
`backend/padel_app/tests/test_semi_auto_approval.py`
`frontend/apps/web/src/components/notifications/ReplacementApprovalCard.tsx`
`frontend/apps/web/e2e/notification-engine/semi-auto-approval.spec.ts`

## Related concepts
[[invitation-engine]]
[[eligibility-bar]]
