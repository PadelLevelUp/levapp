The deliberate, comment-documented practice of porting a web component or feature to its own independent React Native implementation on mobile, rather than sharing UI code across platforms — the CLAUDE.md rule "web and iOS ship together" enforced file-by-file. Most files across the mobile `features/` and `components/ui/` trees carry an explicit doc comment naming the exact web file they are the port of, so business logic and payload shape do not silently diverge across platforms even though the rendering code is fully independent (and, per the design-system pairs below, sometimes drifts anyway — a divergence worth flagging, not an accident to hide). This concept unifies what individual scopes proposed separately as "web-mobile-parity-port" and various "parity" labels into one codebase-spanning entity; the calendar, presence, and dashboard parity pairs are covered in more depth by their own concepts ([[calendar-visual-state]], [[attendance-presence-mark]], [[block-driven-dashboard]]) and are not re-listed exhaustively here.

## Implemented by
`frontend/apps/web/src/components/brand/launch-loader.tsx`
`frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx`
`frontend/apps/web/src/components/players/detail/AddEvaluationSheet.tsx`
`frontend/apps/mobile/src/features/players/add-evaluation-form.tsx`
`frontend/apps/web/src/components/players/detail/PlayerStrengthsWeaknesses.tsx`
`frontend/apps/mobile/src/features/players/StrengthsWeaknesses.tsx`
`frontend/apps/web/src/components/players/detail/AddToClassesDialog.tsx`
`frontend/apps/mobile/src/features/players/add-to-classes-dialog.tsx`
`frontend/apps/web/src/components/players/AddToStandingWaitingListDialog.tsx`
`frontend/apps/mobile/src/features/players/waiting-list-dialog.tsx`
`frontend/apps/web/src/components/training/CourtDiagramEditor.tsx`
`frontend/apps/mobile/src/features/training/court-diagram-editor.tsx`
`frontend/apps/web/src/pages/TrainingGroupsPage.tsx`
`frontend/apps/mobile/src/features/training/groups-tab.tsx`
`frontend/apps/web/src/components/ui/button.tsx`
`frontend/apps/mobile/src/components/ui/button.tsx`
`frontend/apps/web/src/components/ui/avatar.tsx`
`frontend/apps/mobile/src/components/ui/avatar.tsx`
`frontend/apps/web/src/components/ui/card.tsx`
`frontend/apps/mobile/src/components/ui/card.tsx`
`frontend/apps/web/src/components/ui/badge.tsx`
`frontend/apps/mobile/src/components/ui/badge.tsx`

## Related concepts
[[design-tokens]]
[[calendar-visual-state]]
[[attendance-presence-mark]]
[[block-driven-dashboard]]
[[coach-only-settings-gating]]
