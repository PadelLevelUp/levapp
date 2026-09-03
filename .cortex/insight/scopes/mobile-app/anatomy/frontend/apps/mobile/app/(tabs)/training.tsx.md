---
path: frontend/apps/mobile/app/(tabs)/training.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 63
size_tokens: 577
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "190cb8e069466bac196c754573fa17af9dee2bb2026b79822671bf0e24e28560"
---

## Purpose

The Training tab (coach-only): hosts Exercises and Groups as two sub-tabs on one screen, the mobile equivalent of web's separate `/training`, `/training/exercises`, and `/training/groups` pages.

## Connections

Uses:
- `@/features/training/exercises-tab`, `@/features/training/groups-tab`: outside this scope.
- `@levelup/config` (`lightTheme`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- `headerTitle: t("training.title")` here is harmless only because `training.title` and `nav.training` happen to be worded identically in both languages today — `title` on `Stack.Screen` also drives the tab bar label, so rewording either key independently would silently rename the tab (same trap documented more sharply in `settings.tsx`).
