---
path: frontend/apps/mobile/src/features/messages/components/chat-more-options-menu.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 114
size_tokens: 882
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6e1007c182f99c6e3fbbe40954042ce5f5e04bd4b4f46dc536605fec2dd6531e"
---

## Purpose

Floating "more options" menu anchored to a fixed top-right point under the conversation header, offering block/unblock user and report actions. Reuses the exact `Portal` + sibling-backdrop + rounded-card structure of `message-context-menu.tsx` (same VoiceOver/Maestro gotcha: the backdrop and the menu card must be siblings, not parent/child, or the inner buttons become unreachable), but anchors to a fixed point instead of a long-press coordinate.

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@rn-primitives/portal`: `Portal`.
- `react-native-reanimated`: `FadeIn`, `FadeOut`.
- `react-native-safe-area-context`: `useSafeAreaInsets`.
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — opened from the conversation header screen outside this slice.

Semantically related (not imports): `frontend/apps/mobile/src/features/messages/components/message-context-menu.tsx` — same Portal-plus-sibling-backdrop pattern and the same documented a11y gotcha, applied to a different anchor.
