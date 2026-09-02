# LevelUp Frontend — Attendance/Presence Surface Map

Repo root: `/Users/pedropacheco1/Documents/Projetos/padel_app/levelup/levelup_frontend`

## HEADLINE FINDING

**A "Presenças" (Presence/Attendance) feature already exists and shipped as PAD-114.** It is not a stub — it's a complete, spec-driven, tested page: a bar chart of attendance counts over time, range presets (week/month/year/custom), and a scrollable history list of attended classes that deep-links back into the calendar. Spec: `specs/attendance/spec.md` (413 lines). Before planning an import from the reference Lovable app, the team needs to decide whether this is (a) the same feature already done, (b) a different feature that should live alongside it, or (c) a superset that should absorb it. My read after reviewing both surfaces: PAD-114 is a **per-player read-only history view** ("show me presences"), whereas what the team lead described — "validate past classes, per-player presence table, presence charts" — sounds like a **coach-facing bulk validation/table workflow** ("mark/confirm presences across many classes/players at once"). These are complementary, not duplicates, but they'll want to share the chart component, date-range logic, and types. See Gaps section.

---

## 1. Monorepo layout

```
apps/web/         React + Vite + Tailwind + shadcn/ui, port 8080. Playwright E2E in apps/web/e2e/.
apps/mobile/      Expo + Expo Router + NativeWind + react-native-reusables. Maestro E2E in .maestro/.
packages/
  types/          @levelup/types   — shared TS domain types (packages/types/src/domain.ts)
  api/             @levelup/api     — typed axios client + per-resource modules (packages/api/src/resources/*.ts)
  hooks/           @levelup/hooks   — TanStack Query hooks (packages/hooks/src/queries.ts, queryKeys.ts)
  validation/      @levelup/validation — Zod schemas
  config/          @levelup/config  — shared constants/formatters (e.g. shortDate, effectiveFilledSpots)
```

- `packages/*` must stay platform-agnostic (root `CLAUDE.md`): no React DOM/RN/Expo/browser globals. Web injects `localStorage`-backed token storage (`apps/web/src/api/client.ts:1-30`); mobile injects SecureStore (`apps/mobile/src/lib/api.ts`).
- Locale JSON lives at the **repo root** `src/locales/<lng>/<area>.json` (not under `apps/web`) — a monorepo-restructure leftover, loaded via a `../../../src/locales` glob from `apps/web/src/i18n.ts`.
- The API client (axios instance + auth/refresh logic) lives in `packages/api/src/client.ts`; each backend resource gets its own file under `packages/api/src/resources/`, re-exported from `packages/api/src/index.ts`.
- Web-side thin wrappers exist per resource under `apps/web/src/api/*.ts` — they add mock-data branching (`USE_MOCK_DATA`) on top of the shared `@levelup/api` resource module (see §4).

## 2. Existing attendance/presence UI — every surface, in full

### A. `/attendance` and `/players/:playerId/attendance` — the PAD-114 "Presenças" page
- **Page**: `apps/web/src/pages/AttendancePage.tsx` (one component, two entry points — student's own history at `/attendance`, coach viewing a roster player at `/players/:playerId/attendance`). Route guard is UX-only; the backend (`GET /app/attendance_history`) re-authorizes the subject server-side.
- **Chart**: `apps/web/src/components/attendance/AttendanceChart.tsx` — Recharts `BarChart` via the shadcn `ChartContainer` (`@/components/ui/chart`), single series (count), UTC-pinned date formatting, gap-filled buckets from the server, `isAnimationActive={false}` (a documented gotcha — Recharts leaves bars as empty `<g>` under throttled rAF, see [[recharts-zero-height-bars]] in memory).
- **Range controls**: `apps/web/src/components/attendance/AttendanceRangeControls.tsx` — three presets (1W/1M/1Y) + a `…` custom from/to date-pair, rendered **below** the chart per spec rule 10.
- **Range math**: `apps/web/src/components/attendance/dateRanges.ts` — all-UTC, bare `YYYY-MM-DD` strings, deliberately avoiding local-`Date` drift (same class of bug as PAD-33's messaging-timestamp issue).
- **History list**: `apps/web/src/components/attendance/AttendanceHistoryList.tsx` — one row per attended class, each row deep-links via a server-built `href` (`/calendar?classId=lessoninstance-<id>&date=YYYY-MM-DD`) that reopens the calendar on that class's week with `ClassDetailSheet` already open.
- **API**: `apps/web/src/api/attendance.ts` → `@levelup/api` resource `packages/api/src/resources/attendance.ts` → `GET /app/attendance_history`.
- **Types**: `packages/types/src/domain.ts:784-820` — `AttendanceGranularity`, `AttendanceBucket`, `AttendanceSession`, `AttendanceHistory`.
- **i18n**: `src/locales/pt/attendance.json` (+ `en/attendance.json`) — fully localized (pt is fallback locale). **No mobile equivalent** — no `apps/mobile/src/lib/i18n.ts` wiring, no mobile screen. This feature is web-only today.
- **Entry points**: `PageActions` button "Ver presenças" on `PlayerDetailPage.tsx:245-251` (coach → roster player); a KPI on the student dashboard (see `DashboardRenderer`/`KpiGridBlock`, not yet fully traced but referenced by the PAD-114 code comment in `AttendancePage.tsx:26-30`).
- **E2E**: `apps/web/e2e/attendance/attendance-history.spec.ts`.
- **Not in top-level nav** — `AppLayout.tsx`'s `navItems` (`apps/web/src/components/layout/AppLayout.tsx:44-92`) has Dashboard/Calendar/Players/Training/Availability/Messages/Settings, but no "Attendance"/"Presences" entry. It's reachable only via the two deep-link entry points above.

### B. `ClassDetailSheet` — "Mark attendance" flow (per-class, coach-only)
- **File**: `apps/web/src/components/calendar/ClassDetailSheet.tsx` (large, ~1300+ lines — handles the whole class-detail sheet: edit, cancel, invitations, planning, presences, replacement approvals, SSE live updates).
- Coach sees a "Mark attendance" / "Edit attendance" button (`calendar.detail.markAttendance` / `editAttendance`, toggled by `attendanceAlreadyMarked = (active?.presences?.length ?? 0) > 0`) once the class has participants (`ClassDetailSheet.tsx:975-987`).
- Clicking it enters `isValidating` mode; each participant renders as an `AttendanceRow` (`apps/web/src/components/calendar/AttendanceRow.tsx`) with Present/Absent toggle buttons, and if Absent, a Justified/Unjustified toggle. Invited/confirmed badges (from notification-engine invites) also show per row.
- Save calls `handleConfirmAttendance` (`ClassDetailSheet.tsx:511-570+`) → `confirmClassPresences()` (`apps/web/src/api/presences.ts` → `packages/api/src/resources/presences.ts`) → `POST /app/class_instance/presences/confirm`. Response can carry an `approvalBundle` (semi-automatic invite-replacement mode) or a list of `notifiedPlayers` (auto-notify), both surfaced via toast + the invitations panel.
- **Types**: `Presence` (`packages/types/src/domain.ts:197-209`: `id`, `lessonInstanceId`, `playerId`, `status?: 'present'|'absent'`, `justification?`, `invited`, `confirmed`, `validated`). Note `PresenceStatus = 'present' | 'absent'` and `AbsenceJustification = 'justified' | 'unjustified'` (`domain.ts:5-6`) — **only two statuses, no "late"/"excused" granularity beyond justified/unjustified**.
- This is a **single-class, single-sheet** workflow — a coach marks attendance for one class instance at a time, from the calendar. There is no bulk/multi-class table for this today.

### C. Dashboard "Needs you" queue — validation nudge, not a validation UI
- **Type**: `DashboardNeedsYouValidation` (`packages/types/src/domain.ts:399-406`) — "Attendances awaiting validation, scoped to classes that ended last week." Carries `count`, `classCount`, and an `href`.
- **Component**: `ValidationCard` inside `apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx:139-155` — a single-line card ("N presences to review across M classes") with a "Review" button that just `navigate(item.href)` — i.e. it deep-links back into the calendar/`ClassDetailSheet` flow described in (B), one class at a time. **There is no dedicated bulk-validation page or table** — the dashboard only nudges the coach toward the existing per-class sheet.
- Sibling cards in the same queue: `EmptySeatsCard` (invite reminders) and `ReplyCard` (unanswered messages) — same file.

### D. Calendar
- `apps/web/src/pages/CalendarPage.tsx` renders the week grid and opens `ClassDetailSheet` for a clicked class (where attendance marking happens, per B). I did not find any separate attendance-specific calendar view (e.g. a heatmap) — attendance is purely a property surfaced inside the per-class sheet.

### E. Players pages
- `PlayersPage.tsx` (395 lines) — roster list/table, no attendance column or stats visible in a `grep -i attendance/presence/chart/stats` pass.
- `PlayerDetailPage.tsx` (425 lines) — has the "Ver presenças" `PageActions` button (→ A above) as its only attendance surface; no inline attendance stat/chart embedded in the detail page itself. Strengths/weaknesses editor lives here too (unrelated).

### F. Dashboard/stats
- `apps/web/src/pages/DashboardPage.tsx` (88 lines) — thin: fetches `getDashboard({from, to})`, branches into `CoachDashboard` (block-based: `needs_you`, `next_class`, `week_pulse`, etc. — see `apps/web/src/components/dashboard/coach/*`) vs. the generic `DashboardRenderer` for older/player blocks (`apps/web/src/components/dashboard/blocks/*`: `PendingConfirmationsBlock`, `MessagesOverviewBlock`, `ClassListBlock`, `KpiGridBlock`, `NotificationActivityBlock`). `KpiGridBlock` is the likely home of the student's "Attended" KPI referenced by the PAD-114 code comment (not fully read line-by-line, but confirmed present by grep-adjacent context in `AttendancePage.tsx`'s own comment).
- **No coach-facing attendance/presence chart on the dashboard** beyond the one-line validation nudge in (C). All charting today is the single `AttendanceChart` bar chart in the PAD-114 page.

### G. Legacy/unused
- `apps/web/src/data/mockAttendance.ts` — mock-data builder for `AttendanceHistory`, used only when `USE_MOCK_DATA` is set (see §4).
- `apps/web/src/integrations/supabase/` exists in the tree but the app is Flask-backed; likely Lovable-scaffold residue — **worth a sanity check with the team before assuming it's live code**, I did not investigate its contents.

## 3. Routing
- **Router**: React Router v6, `BrowserRouter`/`Routes`/`Route`, all wired in `apps/web/src/App.tsx`.
- **Route guards**: `ProtectedRoute` (any authenticated user), `RoleRoute allowedRoles={[...]}` (role-gated, e.g. `["coach"]` or `["player"]`), `SuperAdminRoute` — all in `apps/web/src/auth/`.
- **Attendance routes today** (`App.tsx:112-135`):
  ```tsx
  <Route path="/players/:playerId/attendance" element={<RoleRoute allowedRoles={["coach"]}><AttendancePage/></RoleRoute>} />
  <Route path="/attendance" element={<RoleRoute allowedRoles={["player"]}><AttendancePage/></RoleRoute>} />
  ```
  Both instructive comments in `App.tsx:106-111` explicitly note the guard is UX-only; the server re-authorizes.
- **Adding a new top-level page/tab**: add a `<Route>` in `App.tsx` (wrapped in `ProtectedRoute`/`RoleRoute` as needed) **and** an entry in `navItems` in `apps/web/src/components/layout/AppLayout.tsx:44-92` (icon from `lucide-react`, `labelKey` pointing into a locale namespace, `path`, `roles`). That's the entire nav/sidebar definition file — no separate config elsewhere.

## 4. Data fetching
- **Two coexisting patterns** in this codebase — worth flagging since a new feature should pick one deliberately:
  1. **TanStack Query hooks** (`packages/hooks/src/queries.ts` + `queryKeys.ts`) — the newer/preferred pattern for Dashboard, Calendar, Players, Messages, Coach levels, Availability, Training/exercises. Central `queryKeys` registry (`packages/hooks/src/queryKeys.ts`) keyed by feature area; query hooks (`useDashboard`, `useCalendarEvents`, `useCoachPlayersPaginated`, etc.) and mutation hooks (`useCreateExercise`, etc.) that `invalidateQueries` on success, all in `packages/hooks/src/queries.ts`.
  2. **Bare `useState`/`useEffect` + a wrapper API module** — this is what PAD-114's `AttendancePage.tsx` and `ClassDetailSheet.tsx` actually use (`apps/web/src/api/attendance.ts`, `apps/web/src/api/presences.ts`, `apps/web/src/api/classes.ts` — thin per-feature modules under `apps/web/src/api/` that layer `USE_MOCK_DATA` branching over the shared `@levelup/api` resource, then get called directly from a component's `useEffect`).
- **API client module**: `packages/api/src/client.ts` — `initApi({baseURL, storage, onUnauthorized})` / `getApi()` (axios instance, singleton, injected per-shell). Each backend endpoint gets a typed function in `packages/api/src/resources/<name>.ts`, all re-exported namespaced from `packages/api/src/index.ts` (e.g. `export * as attendanceApi from "./resources/attendance"`).
- **Representative end-to-end example** (TanStack pattern, exercises — mutation + invalidation):
  ```ts
  // packages/hooks/src/queries.ts
  export function useCreateExercise(options?) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: ExercisePayload) => trainingApi.createExercise(data),
      onSuccess: (...args) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.exercises });
        options?.onSuccess?.(...args);
      },
    });
  }
  ```
  `trainingApi` = `packages/api/src/resources/training.ts`; `queryKeys.exercises` = a `const` array key in `queryKeys.ts`.
- **PAD-114 does NOT have a `queryKeys`/`queries.ts` entry** — `getAttendanceHistory` is called directly from `AttendancePage.tsx`'s `useEffect`, with manual `loading`/`error` state and a cancellation-token pattern (`{cancelled: boolean}` object). If the new Presences feature is built as a coach-facing bulk table, I'd recommend threading it through TanStack Query hooks (pattern 1) rather than replicating PAD-114's manual-fetch pattern, for cache sharing with the calendar/class-instance data it will need.

## 5. Component library & design system
- **shadcn/ui**, primitives in `apps/web/src/components/ui/` (full list): `accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input-otp, input, label, loading-skeleton, menubar, message-textarea, navigation-menu, occupancy-bar, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle-group, toggle, tooltip`. (`loading-skeleton`, `message-textarea`, `occupancy-bar` are app-specific additions on top of stock shadcn.)
- **Chart primitive**: yes — `apps/web/src/components/ui/chart.tsx` (shadcn's `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`, config-driven CSS-variable colors). **Recharts is installed** (`"recharts": "^2.15.4"` in `apps/web/package.json:73`) and is the only charting library in the app; `AttendanceChart.tsx` is the one real usage today.
- **Table primitive**: plain shadcn `table.tsx` — used in exactly one place (`apps/web/src/components/settings/DataImportSection.tsx`). **No TanStack Table** in the repo. A per-player presence table for a new Presences feature would most naturally be built on the plain shadcn table (matching the one precedent) rather than pulling in TanStack Table.
- **Dialog vs Sheet vs Drawer**: `ClassDetailSheet` uses `Sheet` (side panel) for class detail/attendance-marking — that's the established pattern for "detail + actions over a list" (calendar). `AlertDialog` is used for destructive confirmations inside the sheet (e.g. delete/cancel). I did not find a place using `Drawer` — likely reserved for mobile-style bottom sheets, not yet used in this feature area.

## 6. i18n
- **Library**: i18next + react-i18next (PAD-39-locked choice), single `translation` namespace, **fallback/default locale is `pt`** (not `en` — see `apps/web/src/i18n.ts:66-72`).
- **File location**: root-level `src/locales/<lng>/<area>.json` (NOT `apps/web/src/locales` — a monorepo-restructure leftover; the glob in `i18n.ts:23-28` reaches up three directories: `../../../src/locales/*/*.json`).
- **Areas today**: `attendance, auth, availability, calendar, classDetail, common, dashboard, editor, messages, misc, nav, notificationsUi, players, settings, students, training, ui` (one JSON per area per language, `pt`/`en`).
- **Adding a new namespace** (e.g. `presences`): drop `src/locales/pt/presences.json` and `src/locales/en/presences.json` with the top-level key matching your usage (e.g. `{"presences": {...}}`) — the glob auto-picks it up on web, **no `i18n.ts` edit needed**. Deep-merge means each file must own a disjoint top-level key.
- **Mobile is NOT automatic** — [[mobile-locale-namespace-static-import-trap]] (project memory): a new `src/locales` namespace renders raw key paths on mobile unless hand-added to `apps/mobile/src/lib/i18n.ts`'s static imports. PAD-114's `attendance` namespace has in fact **not** been wired there (confirmed: no `attendance` hit in that file), consistent with there being no mobile attendance screen yet. Any new Presences feature that's meant to reach mobile needs this step explicitly.
- Also watch the `_one`/`_other` i18next plural-key convention (used in `attendance.json`'s `total_one`/`total_other`) — a known audit trap per the same memory note.

## 7. Styling / design tokens
- **Tailwind config**: `apps/web/tailwind.config.ts` — `darkMode: ["class"]`, all colors are `hsl(var(--token))` indirections (border, input, ring, background, foreground, primary, secondary, destructive, muted, accent, popover, card, sidebar.*, plus app-specific `academy`, `private`, `success` (with a `success-strong` "text on tint" variant), and presumably `warning`/others further down the file that I didn't read past line 80).
- Fonts: Plus Jakarta Sans (body, `font-sans`), Poppins (`font-display`, used for titles/hero numbers).
- **Attendance chart theming** deliberately uses `hsl(var(--primary))` rather than a hardcoded hex specifically so light/dark both fall out of the existing token system (see comment in `AttendanceChart.tsx:19-23`).
- CSS variable definitions (`:root`/`.dark`) themselves live in a global stylesheet I didn't open (likely `apps/web/src/index.css` or similar) — flagging as unchecked if exact HSL values are needed.
- For anything data-viz specific, note the repo already has a `dataviz` skill available in this environment worth invoking before building new charts/tables for a Presences feature.

## 8. Testing conventions
- **Unit tests**: colocated `*.test.ts(x)` under `apps/web/src` (vitest) and `packages/*/src` (e.g. `packages/hooks/src/queryKeys.test.ts`, `packages/api/src/client.test.ts`). Root `npm test` runs both (`apps/web` vitest + `vitest.packages.config.ts`).
- **Playwright E2E**: `apps/web/e2e/<folder>/<name>.spec.ts`, folders organized by feature area (`attendance/`, `calendar/`, `schedule-calendar/`, `players/`, `player-management/`, `dashboard/`, `messaging/`, `notification-engine/`, `training-*`, `settings/`, `security/`, `import-history/`, `evaluation-tools/`, `availability/`, `clubs/`, `auth-onboarding/`, `editor/`, `loading-states/`, plus `helpers/` and `scripts/`).
- **Existing attendance/presence specs**:
  - `apps/web/e2e/attendance/attendance-history.spec.ts` — the PAD-114 page.
  - `apps/web/e2e/schedule-calendar/attendance.spec.ts` and `attendance-save.spec.ts` — the ClassDetailSheet mark-attendance flow.
  - `apps/web/e2e/notification-engine/cancel-attendance.spec.ts` and `cancel-attendance-class-view.spec.ts` — student-side decline/cancel flows (PAD-46/73), adjacent but not "presence marking" per se.
- **Adding a new spec**: new file under the matching `e2e/<folder>/`, test names prefixed `"US-XXX: description"` or `"PAD-XXX: description"` for traceability; locator priority `getByRole` > `getByPlaceholder` > `getByLabel` > `getByText` > CSS class (per `apps/web/CLAUDE.md`).
- **Seed data**: `apps/web/e2e/scripts/seed.py`. Seeded users: coach `e2e-coach`/`E2eCoach123!`, `e2e-coach-nolevels` (deliberately no CoachLevel rows), students `e2e-student`/`e2e-student-2`, class "E2E Academy Class" next-Monday 10:00. A new Presences E2E spec will likely need seeded **past/completed** class instances with presence rows already set — I did not find existing seed data for completed/historical classes; this looks like a gap the backend agent should confirm (do any seeded lesson instances have `status: 'completed'` + `Presence` rows today?).
- **`write-e2e-test` and `run-e2e-iterate` skills** are available in this environment and are the house convention for TDD-ing a new page (write the spec before implementing, per this project's ticket workflow).

## 9. Gaps — what a "Presences" tab (validate past classes, per-player table, presence charts) needs that doesn't exist today

1. **No bulk/multi-class validation UI.** Today "validate attendance" = open one class in `ClassDetailSheet` at a time (§2B), nudged one line at a time from the dashboard queue (§2C). A tab that lists *all* past-and-unvalidated classes with inline per-player marking (a table, not a per-class sheet) is new UI, though it can reuse `AttendanceRow`'s present/absent/justified interaction model and `confirmClassPresences` (`packages/api/src/resources/presences.ts`) as the mutation.
2. **No top-level nav entry.** PAD-114's attendance page is deep-link-only (§3). A "Presences" tab means a new `navItems` entry in `AppLayout.tsx:44-92` and deciding role-visibility (coach-only, presumably, given "validate" is a coach action) plus how it coexists with the existing per-player `/players/:playerId/attendance` route (should the tab list link into that same page for per-player drill-down, reusing `AttendanceChart`/`AttendanceHistoryList`, rather than re-building it?).
3. **No aggregate/roster-wide presence table or chart.** `AttendanceChart` (§2A) is scoped to one player. A coach-facing table of "all players × their attendance rate" or a roster-wide chart is new — no existing component, no existing endpoint I found in the frontend surface (backend agent should confirm whether `GET /app/attendance_history` or a new endpoint would back this; PAD-114's endpoint takes a single optional `playerId`, not a list).
4. **No backend "past classes needing validation" listing endpoint surfaced to the frontend beyond the dashboard's summarized count/href** (`DashboardNeedsYouValidation`, §2C) — a real Presences tab needs a paginated/listable version of that query (which classes, which players unmarked), not just a count.
5. **No TanStack Query hooks for attendance/presences** (§4) — `queryKeys.ts`/`queries.ts` have zero entries for `attendance` or `presences`. Building the new feature on the established hook pattern (rather than PAD-114's manual `useState`/`useEffect`) would both modernize and make it consistent with Players/Dashboard/Calendar.
6. **No mobile surface at all** (§6) — if "Presences" is meant to reach the mobile app eventually, both the screen and the i18n static-import wiring are net-new work, not a port.
7. **Table primitive choice**: only one precedent (`DataImportSection.tsx` using plain shadcn `table.tsx`, §5) — worth deciding up front whether a presence table needs sorting/pagination (→ maybe TanStack Table, a new dependency) or a simple static table suffices (→ reuse the existing shadcn primitive, zero new deps, consistent with the "keep dependencies lean" precedent set by the exercises/players/messages hooks).
8. **`PresenceStatus` is binary** (`present`/`absent` only, §2B) — if the reference Lovable app's presence model has more granularity (late, excused, etc.), that's a type/schema change, not just a frontend build — flag to the backend agent.
9. **No seeded historical/completed class data for E2E** (§8, unconfirmed) — worth checking with the backend/E2E owner before writing a new Playwright spec for a validation table.
