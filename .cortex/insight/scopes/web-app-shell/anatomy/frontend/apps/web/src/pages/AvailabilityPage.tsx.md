---
path: frontend/apps/web/src/pages/AvailabilityPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 461
size_tokens: 3912
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6d8063598989118b69f1f7f9fcf93e88a643b5dbce455328c767749b140dddf5"
---

## Purpose

The `/availability` page for players: full CRUD over "availability blockers" — time windows when the player is unavailable and should not receive class-notification pings (`t("availability.wontReceive")`). Supports one-off (single date) and weekly-recurring blockers (day-of-week multi-select, defaulting to the chosen date's weekday if none picked, with a repeat-until end date defaulting to 3 months out). Inline create/edit form (no dialog), list of existing blockers with edit/delete icon buttons, and a confirmation `AlertDialog` for delete. A PAD-119 comment documents a responsive fix: below `sm` the pt-locale title text and the add button don't fit on one row, so they stack instead of the button overflowing off-screen; badges wrap for the same reason.

## Connections

Uses: `@/api/availability` (`listBlockers`, `createBlocker`, `updateBlocker`, `deleteBlocker`, types `AvailabilityBlocker`/`BlockerInput`, outside this scope), `@/components/layout/AppLayout` (outside this scope), `@/components/ui/{alert-dialog,badge,button,card,input,label,separator,switch}` (outside this scope), `@/hooks/use-toast` (outside this scope), `@/lib/utils` (`cn`, this scope), external `date-fns`, `lucide-react`, `react`, `react-i18next`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/availability` (`RoleRoute allowedRoles={["player"]}`).
