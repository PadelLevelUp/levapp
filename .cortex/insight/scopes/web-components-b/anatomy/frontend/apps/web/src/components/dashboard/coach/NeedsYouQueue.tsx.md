---
path: frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 156
size_tokens: 1417
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eb449a6cb789460713577e1db04389ae06146f54b3f411c730a6aeef0ed43b9b"
---

## Purpose

Renders the coach dashboard's "needs you" queue: a server-ordered list (empty seats soonest-first, then replies, then attendance validation) of one of three item kinds — `EmptySeatsCard`, `ReplyCard`, `ValidationCard` — each carrying its own resolution so the list can empty out entirely rather than just decrementing a counter. Mobile renders one full-width card per row (the reply card has no buttons; the whole card is the tap target); desktop switches to a two-column grid where the reply card gains inline actions and the single-line validation card spans both columns.

## Connections

Uses: `./primitives` (`ActionCard`, `Eyebrow`) for the shared visual chrome; `@levelup/config`'s `shortDate` to format the empty-seats card's date; `@levelup/types` for the `DashboardNeedsYouBlock`/`...Item`/`...Reply`/`...Validation`/`...EmptySeats` shapes; `@/components/ui/button`; `react-router-dom`'s `useNavigate` to open the target class/thread.

Used by: `frontend/apps/web/src/components/dashboard/CoachDashboard.tsx` (outside this scope), one of the coach dashboard's stacked blocks.

Semantically related (not imports): `dashboard/coach/Schedule7Days.tsx`, `NextClassHero.tsx`, `WeekPulse.tsx` — sibling coach-dashboard blocks sharing `primitives.tsx` and the same "no badge/accent unless it means something" design rule documented there.
