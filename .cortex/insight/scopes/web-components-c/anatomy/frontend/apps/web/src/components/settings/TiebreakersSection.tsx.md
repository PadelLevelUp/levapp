---
path: frontend/apps/web/src/components/settings/TiebreakersSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 94
size_tokens: 914
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "811f87b4a310e8d05b7d68bf7d6dbdabcaf4a5567f08963f19def7ed3c8556fc"
---

## Purpose

`TiebreakersSection` is a drag-reorderable, individually-toggleable list controlling which criteria (fewest unjustified absences, most justified absences, highest attendance rate, matching playing side, active subscription) break ties when the invitation/waiting-list engine ranks candidates, and in what priority order (list position = priority, shown via a numbered badge per row). Exports `DEFAULT_TIEBREAKERS` — the seed list used when a coach hasn't customized tiebreakers yet — alongside the component.

## Connections

Uses:
- `@/components/ui/switch`.
- `@/types` (`Tiebreaker`).

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it in the "Tiebreakers" collapsible, falling back to `DEFAULT_TIEBREAKERS` when `config.tiebreakers` is empty, and disabling the whole panel when the master `autoNotifyEnabled` switch is off.

Semantically related (not imports): the id→i18n-key label lookup with an English-string fallback (`TIEBREAKER_LABEL_KEYS`, PAD-54) is the same defensive pattern used by `NotificationGroupsSection`'s `GROUP_LABEL_KEYS` and `ImportHistorySection`'s `STATUS_LABEL_KEYS`/`TABLE_LABEL_KEYS`.
