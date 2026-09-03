---
path: frontend/apps/mobile/src/features/presences/PresenceMarkToggle.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 81
size_tokens: 763
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c8628140421bde17c53517e20c09deeec8fe0036515fc136ea14edf58d4e6cdf"
---

## Purpose

`PresenceMarkToggle` is the three-way present/justified/unjustified attendance control from PAD-140 — the iOS twin of web's `PresenceMarkToggle`. Both platforms write the same `status` + `justification` pair through the shared mapping in `@levelup/config`, so they can only differ in how the choice is drawn, never in what it means. Each option is rendered as its own sibling `Pressable` (not a segmented-control single widget) because `accessibilityState.selected` on three separate buttons is what Maestro (the mobile E2E driver) can actually assert against, and because nesting Pressables breaks touch handling on iOS in this codebase.

## Connections

Uses (external, not in this scope): `@levelup/config` for the `PresenceMark` type (the three-value union this component renders options for).

Used by: `frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx`: renders one `PresenceMarkToggle` per player row inside an expanded `ClassCard`, passing the effective mark (stored value layered with local edits) and an `onChange` that writes into the parent's `edits` state.
