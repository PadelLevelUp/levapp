---
path: frontend/apps/web/src/components/students/StudentDetailSheet.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 175
size_tokens: 1723
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "edeb62cda4b3d8cfd46bcbe98eb58a3120d686ac8e3a7cbdb3a070f868d1b571"
---

## Purpose

`StudentDetailSheet` is a slide-over `Sheet` showing a single student's profile (avatar initials, level/side badges, contact info) plus editable level/side `Select` fields, and — for students with no linked user account (`isInactive`) — a copyable registration invite link. The Level/Side selects and the "Save changes" button are presentational only: they use `defaultValue` (uncontrolled) with no `onValueChange`/`onClick` handler, so unlike every other editable-record component in this scope (`CoachLevelsSection`, `SeasonsSection`, etc., which all follow a load→edit→save round-trip through an API module), edits made here are visually possible but not persisted — treat this file as an unfinished stub for that flow rather than a working editor.

## Connections

Uses:
- `@/types` (`CoachPlayer`, `CoachLevel`, `sideLabel`): `sideLabel` is called with a hardcoded `locale: 'es'` regardless of the active i18n language, unlike the `t()` calls surrounding it elsewhere in the component — a likely i18n gap if this file is otherwise localized.
- `@/components/ui/{sheet,button,input,label,avatar,badge,separator,select}`.
- `sonner` (`toast`): copy-link success/failure feedback.

Used by: not observed within this scope (likely rendered from a Students list page outside this scope).
