---
id: B-065
title: "iOS calendar day sheet renders flat: no 20pt top corners, no upward shadow, unlike web"
type: missing-criterion
severity: low
status: resolved
affects:
  - calendar.mobile-views
  - frontend/apps/mobile/src/features/calendar/DaySheet.tsx
proposed_fix: "Split the sheet into an outer view that casts the upward navy shadow with explicit shadow props and an inner view that clips to the 20pt top corners; pin it with a criterion in calendar.mobile-views and a Maestro screenshot on the simulator."
opened: 2026-09-11T13:20:00Z
resolved: 2026-09-11T14:30:00Z
---

# B-065 — iOS calendar day sheet renders flat: no 20pt top corners, no upward shadow

**Source:** founders' notes 2026-09-11 ("No calendário no iOS a vista do dia não tem o border
radius e shadow que tem na web app e devia ter"), ticket PAD-286 item 3. Session F.

**What happens:** on iOS the Semana / Mês day sheet sits on the time grid as a flat panel:
no rounded top corners are visible and no shadow separates it from the grid. On web the same
sheet has 20px top corners and a shadow cast upward.

**What should happen:** rule 3 of `calendar.mobile-views` has required "a grab handle, 20px top
radius, an upward shadow" on both shells since PAD-247.

**Root cause (code read, `frontend/apps/mobile/src/features/calendar/DaySheet.tsx` line 63,
unchanged since PAD-247 `1d4513986`):** one `View` carries
`overflow-hidden rounded-t-[20px] bg-background shadow-lg`. Two things follow.
1. `shadow-lg` is Tailwind's downward shadow. NativeWind compiles a `shadow-*` utility from the
   first entry of the theme's `boxShadow` value (`nativewind/dist/tailwind/shadows.js`:
   `-rn-shadow-offset-height: y`, `-rn-shadow-radius: blur`, `-rn-shadow-opacity: 1`), so `lg`
   becomes offset `0, +10`, radius 15, black at 10%: a shadow below the sheet, where the sheet
   meets the screen bottom and nothing can show it. Web's sheet uses an explicit
   `shadow-[0_-10px_24px_rgba(11,21,36,0.14)]`, cast upward.
2. `overflow-hidden` on the same view makes iOS clip that view to its bounds, and a layer that
   clips its children also clips its own shadow. So even an upward shadow on this view would
   not render.
The 20pt corners are there in the style, but the sheet and the grid behind it both use the
`background` token, so without the shadow the corners have nothing to contrast against and the
sheet reads as flat. Web has the same two colours and reads correctly because of the shadow.

**Evidence:** code and compiler read above; the founders' report on a device. Not reproduced on
the simulator by Session F before the fix (the simulator is Session E's during the batch-3
suites); the resolution records the after screenshot.

**Diagnostic tree:** the dev spec exists (rule 3), the rule is correct, but no acceptance
criterion pinned the corners and shadow — "Bottom sheet resizes within bounds" only covers
the travel. → type 1, `missing-criterion`. No layer drift: the business spec describes the
day sheet as a journey, not its chrome.

**Affected specs:**
- Dev: `.specflow/specs/calendar/mobile-views.spec.md` (rule 3)
- Business: `.specflow/specs-business/calendar/coach-views-and-manages-schedule.business.md` (unchanged)

### Change Plan

**Spec to modify:** `.specflow/specs/calendar/mobile-views.spec.md` — rule 3 now names the
shadow (`0 -10px 24px` navy `#0B1524` at 14%) and the iOS outer/inner split; new criterion
"The iOS sheet has the web sheet's corners and shadow".

**Then:**
1. Pin the iOS sheet chrome in a plain module both the component and a vitest test import
   (`sheet-chrome.ts`: radius 20, shadow offset height −10, radius 12, opacity 0.14, navy),
   so the direction and size cannot drift silently — the mobile unit runner cannot render
   components.
2. `DaySheet.tsx`: outer `View` = position + shadow props (no `overflow`), inner `View` =
   `rounded-t-[20px] overflow-hidden` with the handle, header and list.
3. Screenshot on the simulator in Semana (Maestro flow 35) as the visual evidence.

### Resolution

- Spec changes: `.specflow/specs/calendar/mobile-views.spec.md` rule 3 (shadow named, iOS
  outer/inner split) + criterion "The iOS sheet has the web sheet's corners and shadow".
- Tests added: `apps/mobile/src/features/calendar/sheet-chrome.test.ts` (pins radius 20, offset
  0/−10, navy at 14%, radius 12, 28pt handle row; watched red on the PAD-247 values first);
  Maestro flow `35-day-sheet-polish` (handle present, Mês swipe up/down).
- Code changes: `apps/mobile/src/features/calendar/DaySheet.tsx` is now an outer view carrying
  the upward shadow from `sheet-chrome.ts` (no overflow) around an inner view that clips to the
  20pt top corners; `sheet-chrome.ts` holds the numbers.
- Evidence: flow 35 passed on the pinned iPhone 17 Pro simulator (37/37 steps, 2026-09-11
  14:23); screenshots in Semana and Mês show the rounded corners with a shadow above the
  sheet's edge, matching web. Attached to the PAD-286 PR.
- Resolved: 2026-09-11 (PAD-286).
