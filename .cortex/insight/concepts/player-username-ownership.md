Choosing a username is choosing a credential, and a credential belongs to the player, not the coach (PAD-105). The coach's add-player and edit-player surfaces expose no username field and never see the internal `pending-<hex>` placeholder a new player is created with; a player only picks their own username on the invite-link or registration-link flow they complete themselves.

## Implemented by
`backend/padel_app/tools/username_tools.py`
`backend/padel_app/services/player_service.py`
`backend/padel_app/tests/test_pad105_coach_never_sets_username.py`
`frontend/apps/web/src/components/players/AddPlayerSheet.tsx`
`frontend/apps/web/src/pages/RegisterPage.tsx`
`frontend/apps/web/e2e/player-management/ticket-pad-105-coach-no-username.spec.ts`
`frontend/apps/web/e2e/player-management/duplicate-username-warning.spec.ts`
`frontend/apps/web/e2e/player-management/player-invite-completion.spec.ts`

## Related concepts
[[coach-scoped-authorization]]
