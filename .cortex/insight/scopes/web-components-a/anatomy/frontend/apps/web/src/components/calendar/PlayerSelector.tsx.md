---
path: frontend/apps/web/src/components/calendar/PlayerSelector.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 204
size_tokens: 1849
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f77c467ce992b6d760c3a4ec94735a66ec319728b0549fa40885b8f44bddb001"
---

## Purpose

The participant picker shared by `AddClassSheet` and `ClassDetailSheet`'s edit mode: a "Participants (N)"/"All" tabs split, where the "All" tab offers accent-normalized name search (`normalize()` strips diacritics and punctuation) plus level-filter chips, and flags any selected player whose level doesn't match the class's `classLevelId` with a warning-styled badge and background tint rather than blocking the selection outright — an out-of-level enrolment is allowed, just visibly called out.

## Connections

Uses: none within this scope; imports `@/components/ui/badge`, `@/components/ui/checkbox`, `@/components/ui/input`, `@/components/ui/scroll-area`, `@/components/ui/tabs`, `@/lib/utils`, `@/types` (`CoachPlayer`, `CoachLevel`), `lucide-react`, `react-i18next` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` (create form) and `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` (edit mode).
