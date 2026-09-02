# Functional spec: PlayersTable, PresencesCharts, index.tsx (Presences page)

Base dir: `reference/Presence Overview/`
Files read in full: `src/components/presences/PlayersTable.tsx` (206 lines), `src/components/presences/PresencesCharts.tsx` (76 lines), `src/routes/index.tsx` (88 lines), `src/lib/presences-data.ts` (108 lines), `src/routes/__root.tsx` (130 lines), `src/components/AppShell.tsx` (partial, nav section).

Stack: React + TanStack Router (file-based, SSR-capable `createFileRoute`), Tailwind CSS with CSS-variable design tokens, shadcn/ui primitives, lucide-react icons, **recharts** for charts. No `table.tsx`/`badge.tsx`/`avatar.tsx` shadcn primitives are used by these three files (see §7).

---

## 1. PlayersTable (`src/components/presences/PlayersTable.tsx`)

### 1.1 Data source
Imports from `@/lib/presences-data`: `COLUMNS`, `DEFAULT_VISIBLE`, `players`, and type `ColumnKey` (`presences-data.ts:14`).

### 1.2 State (lines 17–22)
- `query: string` — search text, default `""`
- `minTotal: string` — numeric filter input (kept as string), default `""`
- `maxUnjustified: string` — numeric filter input, default `""`
- `visible: ColumnKey[]` — which columns show, default `DEFAULT_VISIBLE`
- `sortKey: ColumnKey` — default `"total"`
- `sortDir: "asc" | "desc"` — default `"desc"`

### 1.3 Derived data
- `shown = COLUMNS.filter(c => visible.includes(c.key))` (line 24) — ordered subset of `COLUMNS` (order always follows the master `COLUMNS` array, not toggle order).
- `rows` (useMemo, lines 26–41): filter then sort.
  - Filter predicate: `p.name` case-insensitive substring match on trimmed `query` **AND** `p.total >= minTotal` (empty ⇒ `-Infinity`, i.e. no lower bound) **AND** `p.unjustified <= maxUnjustified` (empty ⇒ `Infinity`, i.e. no upper bound).
  - Sort: string columns via `localeCompare`, numeric columns via subtraction; direction flips comparator sign for `desc`.

### 1.4 Sorting behaviour (`toggleSort`, lines 43–49)
- Click a column header: if it's already the active sort column, **flip direction**; otherwise switch `sortKey` to that column and reset direction — `"asc"` if the new key is `"name"`, else `"desc"` (numeric columns default to descending-first, i.e. "biggest first").
- Every header (all of `shown`) is clickable, not just numeric ones.

### 1.5 CSV export (`exportCsv`, lines 51–62)
- Button "Export CSV" (Download icon) — exports **currently visible columns** (`shown`) × **currently filtered/sorted rows** (`rows`), i.e. respects search/min/max filters and column visibility, and row order matches on-screen sort.
- Header row = column labels joined by comma (no quoting on labels).
- Body rows: `name` cell is wrapped in double quotes (`"Miguel Ferreira"`), all other cells are raw unquoted values (numbers — safe, no delimiter risk).
- Built as a `Blob` (`text/csv;charset=utf-8;`), downloaded via a transient `<a download="presences.csv">` click, then `URL.revokeObjectURL`. Filename is always `presences.csv` (no date stamp, no player-name-based filename).

### 1.6 Layout / DOM structure
Root: `<section className="rounded-xl border border-border bg-card shadow-sm">` (line 65) — a bordered white/card panel, rounded-xl, subtle shadow. Consistent with `ChartCard` in PresencesCharts (§2) and the `Stat` tiles in index.tsx (§3) — this is the shared "card" visual language.

**Header bar** (`div.flex.flex-wrap.items-end.justify-between.gap-3.border-b.border-border.p-5`, lines 66–146):
- Left: title block —
  - `<h2>` "Players" — `text-base font-semibold text-card-foreground`
  - `<p>` "{rows.length} of {players.length} players" — `text-xs text-muted-foreground` — live count reflecting current filter results vs. total dataset size.
- Right: toolbar, `flex flex-wrap items-end gap-3` (line 74), containing 5 controls in order:
  1. **Search input** (lines 75–83): `Search` icon (lucide) absolutely positioned inside the input (`left-2.5 top-2.5`, `pointer-events-none`, muted color), `Input` placeholder `"Search player…"`, `h-9 w-52 pl-8` (icon padding).
  2. **Min. total presences** (lines 85–95): `Label` "Min. total presences" (`text-[11px] text-muted-foreground`) above a `type="number" min={0}` `Input`, placeholder `"0"`, `h-9 w-32`.
  3. **Max. unjustified** (lines 97–107): `Label` "Max. unjustified" above `type="number" min={0}` `Input`, placeholder `"any"`, `h-9 w-28`.
  4. **Columns dropdown** (lines 109–139): `DropdownMenu` triggered by outline `Button` (`size="sm" h-9`) with `Columns3` icon + text "Columns". Menu content (`w-60`, `align="end"`):
     - `DropdownMenuLabel` "Visible columns"
     - `DropdownMenuSeparator`
     - One row per `COLUMNS` entry: a `<label>` wrapping a `Checkbox` (checked = `visible.includes(c.key)`) + the column's `label` text. **The "name"/"Player" checkbox is `disabled`** (line 127) — the Player name column can never be hidden. Toggling adds/removes the key from `visible` (order of `visible` array changes, but display order is still governed by `COLUMNS` order via `shown`).
  5. **Export CSV button** (lines 141–144): solid/primary `Button size="sm" h-9`, `Download` icon + text "Export CSV" → calls `exportCsv()`.

**Table** (`div.overflow-x-auto` wrapping a plain `<table className="w-full border-collapse text-sm">`, lines 148–203) — NOT the shadcn `table.tsx` component; this is a hand-rolled semantic `<table>`.
- `<thead>`: single row, `border-b border-border bg-muted/50`. Each `<th>` (lines 152–176):
  - `onClick={() => toggleSort(c.key)}` — whole header cell is clickable (cursor-pointer, select-none).
  - Alignment: numeric columns `text-right`, else `text-left`.
  - Style: `whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground`, hover → `text-foreground`.
  - Content: label text + a sort-state icon, inline-flex gap-1:
    - Active column: icon is `ArrowUp` (asc) or `ArrowDown` (desc), and label+icon turn `text-foreground` (from muted).
    - Inactive column: `ChevronsUpDown` icon at `opacity-40`.
- `<tbody>`: one `<tr>` per row in `rows` (lines 180–193), `key={p.id}`, `border-b border-border/70`, `last:border-0`, `hover:bg-muted/60` (row hover highlight, no click handler — rows are NOT clickable/no navigation).
  - Each `<td>` per visible column (lines 182–190): `whitespace-nowrap px-4 py-3`; numeric columns get `text-right tabular-nums text-foreground`, non-numeric get `font-medium text-foreground`. Cell content is the raw value `p[c.key]` — no formatting/truncation, no icons, no badges/pills, no avatars anywhere in this table.
- **Empty state** (lines 194–200): when `rows.length === 0`, a single `<tr>` with one `<td colSpan={shown.length}>` centered, `px-4 py-10 text-center text-sm text-muted-foreground`, text: **"No players match these filters."**
- No pagination — all filtered/sorted rows render at once (dataset is 25 mock players).
- Responsive: horizontal scroll via `overflow-x-auto` wrapper if the table is wider than viewport (columns don't reflow/stack on narrow screens); the header toolbar uses `flex-wrap` so filter controls wrap to multiple lines on narrow widths.

### 1.7 Interactive element inventory (PlayersTable)
| Element | Location | Effect |
|---|---|---|
| Search input | toolbar | filters rows by name substring (case-insensitive) |
| "Min. total presences" number input | toolbar | filters rows where `total >= value` |
| "Max. unjustified" number input | toolbar | filters rows where `unjustified <= value` |
| "Columns" dropdown button (Columns3 icon) | toolbar | opens column-visibility menu |
| Per-column checkbox in dropdown | dropdown | toggles that column's visibility; "Player" checkbox is disabled/always on |
| "Export CSV" button (Download icon) | toolbar | downloads `presences.csv` of current filtered/sorted/visible data |
| Column header (any visible column) | table head | click = sort by that column, toggling asc/desc on repeat click |

### 1.8 Column catalogue (from `presences-data.ts:90-99`)
| key | label | numeric | default visible |
|---|---|---|---|
| `name` | Player | no | yes (always, checkbox disabled) |
| `total` | Total presences | yes | yes |
| `private` | Private classes | yes | yes |
| `academy` | Academy classes | yes | yes |
| `justified` | Justified absences | yes | no |
| `unjustified` | Unjustified absences | yes | yes |
| `invitesReceived` | Invites received | yes | no |
| `invitesJoined` | Joined as invite | yes | no |

`DEFAULT_VISIBLE = ["name", "total", "private", "academy", "unjustified"]` (5 of 8 columns shown by default; `justified`, `invitesReceived`, `invitesJoined` start hidden but are toggleable).

---

## 2. PresencesCharts (`src/components/presences/PresencesCharts.tsx`)

Library: **recharts** (`BarChart`, `PieChart`, `LineChart`, with `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `Cell`, `ResponsiveContainer`). Data from `@/lib/presences-data`: `topPlayers`, `typeSplit`, `weeklyPresences`.

### 2.1 Shared wrapper — `ChartCard` (lines 18–30)
Local helper component, props `{ title, subtitle, children }`:
- Card: `rounded-xl border border-border bg-card p-5 shadow-sm` (same card language as PlayersTable's `<section>`).
- `<h3>` title — `text-sm font-semibold text-card-foreground`.
- `<p>` subtitle — `text-xs text-muted-foreground mb-4`.
- Chart area: fixed `h-60` (240px) div containing recharts `ResponsiveContainer width="100%" height="100%"`, with the chart element passed as `children` (cast to `React.ReactElement`).

Shared `tooltipStyle` object (lines 32–38): `borderRadius: 10`, `border: 1px solid var(--border)`, `background: var(--card)`, `fontSize: 12`, `color: var(--card-foreground)` — all values are CSS custom properties, so tooltip auto-adapts to the app's theme tokens (light/dark).

Layout of the 3 cards: `<div className="grid gap-4 lg:grid-cols-3">` (line 42) — stacked full-width on mobile/tablet, 3-column grid at `lg` breakpoint.

### 2.2 Chart 1 — "Presences per player" (bar chart, lines 43–51)
- Subtitle: "Top 8 players"
- Data: `topPlayers` (`presences-data.ts:70-76`) — the 8 players with highest `total`, sorted descending, each mapped to `{ name: "First L.", presences: total }` (first name + last-initial, e.g. "Miguel F.").
- `BarChart` margin `{ top:4, right:8, left:-20, bottom:0 }`.
- `CartesianGrid` dashed (`3 3`), `stroke="var(--border)"`, horizontal lines only (`vertical={false}`).
- `XAxis dataKey="name"`: tick font-size 10, `interval={0}` (show every label), labels rotated `angle={-30}`, `textAnchor="end"`, axis height 54 (room for rotated labels), stroke `var(--muted-foreground)`.
- `YAxis`: tick font-size 11, stroke `var(--muted-foreground)`.
- `Tooltip`: shared `tooltipStyle`, `cursor={{ fill: "var(--muted)" }}` (hover column highlight).
- `Bar dataKey="presences"`: fill `var(--chart-1)`, top corners rounded `radius={[5,5,0,0]}`.
- No `Legend` (single series, self-evident from axis).
- Metric communicated: which players attend most overall, ranked, top 8 only.

### 2.3 Chart 2 — "Private vs Academy" (donut/pie chart, lines 53–63)
- Subtitle: "Share of all presences"
- Data: `typeSplit` (`presences-data.ts:78-81`) — 2 slices: `{ name: "Private", value: sum of all players' private }`, `{ name: "Academy", value: sum of all players' academy }`.
- `Pie dataKey="value" nameKey="name"`, `innerRadius={55} outerRadius={85}` → donut shape, `paddingAngle={3}` (gap between slices), `stroke="var(--card)"` (slice border matches card background, creating a separating ring).
- Per-slice `Cell` colors: index 0 (Private) → `var(--chart-1)`, index 1 (Academy) → `var(--chart-2)`.
- `Legend verticalAlign="bottom" iconType="circle"`, `wrapperStyle={{ fontSize: 12 }}` — circular swatches below the donut, only chart with a legend.
- `Tooltip`: shared `tooltipStyle`.
- Metric communicated: proportion of total attendance from private lessons vs. academy classes, aggregated across all players.

### 2.4 Chart 3 — "Presences over time" (line chart, lines 65–73)
- Subtitle: "Last 8 weeks"
- Data: `weeklyPresences` (`presences-data.ts:83-86`) — 8 points `{ week: "W1"…"W8", presences: pseudo-random 48–88+trend }` (deterministically seeded, mildly upward-trending mock data).
- `LineChart` margin `{ top:4, right:12, left:-20, bottom:0 }`.
- `CartesianGrid` dashed, horizontal-only, same styling as Chart 1.
- `XAxis dataKey="week"`: tick font-size 11, stroke `var(--muted-foreground)` (no rotation needed — short labels).
- `YAxis`: tick font-size 11, stroke `var(--muted-foreground)`.
- `Tooltip`: shared `tooltipStyle`.
- `Line type="monotone" dataKey="presences"`: stroke `var(--chart-1)`, `strokeWidth={2.5}`, `dot={{ r:3 }}`, `activeDot={{ r:5 }}` (dot grows on hover).
- No `Legend` (single series).
- Metric communicated: attendance trend over the last 8 weeks (aggregate, not per-player).

### 2.5 Animation / responsiveness / empty state
- No animation props set explicitly (recharts defaults — bars/line/pie animate in on mount; no `isAnimationActive={false}` anywhere, unlike the project's own known "recharts zero-height bars" gotcha about disabling animation).
- Fully responsive via `ResponsiveContainer width="100%" height="100%"` inside a fixed `h-60` box — chart width scales with card width (1 col on small screens, 1/3 of `max-w-7xl` grid on `lg+`), height is always fixed at 240px regardless of viewport.
- No explicit empty-state handling — charts assume `presences-data.ts` always returns non-empty arrays (mock/deterministic data, so this is never exercised in this prototype).

### 2.6 Interactive element inventory (PresencesCharts)
| Element | Effect |
|---|---|
| Hovering a bar (Chart 1) | Tooltip shows player name + presences count; column background highlighted (`cursor` fill) |
| Hovering a pie slice (Chart 2) | Tooltip shows Private/Academy + value |
| Hovering a line point (Chart 3) | Tooltip shows week + presences; dot enlarges (r 3→5) |
| Legend (Chart 2 only) | Static, decorative — recharts default legend has no click-to-toggle handler wired here (no `onClick` prop passed), so effectively display-only |

No buttons, tabs, selects, or inputs in this file — it is purely a data-visualization block with hover-only interactivity.

---

## 3. `src/routes/index.tsx` — Presences page composition

### 3.1 Route registration (lines 8–28)
`createFileRoute("/")({ component: PresencesTab, head: () => ({...}) })`. SEO/meta: title "Presences — Padel Coach Attendance Dashboard", description mentions "presences per player, private vs academy split, weekly trends and a sortable, filterable players table", OG tags mirror it, `twitter:card: summary_large_image`.

### 3.2 Page shell
`<main className="min-h-screen bg-background">` → `<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">` — standard centered max-width content container with responsive horizontal padding.

### 3.3 Header (lines 52–60)
- Eyebrow: "Padel Coach · Attendance" — `text-xs font-medium uppercase tracking-widest text-muted-foreground`.
- `<h1>` "Presences" — `text-2xl font-semibold tracking-tight text-foreground`.
- Subtitle: "Attendance across private and academy classes, including guests joining by invite." — `text-sm text-muted-foreground`.

### 3.4 ValidateClasses block (line 62–64)
`<div className="mb-4 sm:max-w-sm"><ValidateClasses /></div>` — a separate component (`src/components/presences/ValidateClasses.tsx`, not in this agent's scope — investigated by teammate `ref-validate`) rendered above the KPI tiles, capped to `max-w-sm` on `sm+` screens (i.e. it's a compact widget, not full-width). It imports from `@/lib/classes-data` (a different data module than `presences-data.ts`) and uses `Dialog`, `Checkbox`, icons like `ClipboardCheck`/`AlertTriangle`/`CheckCircle2`/`UserPlus`/`Pencil` — appears to be a class-attendance validation flow, out of scope for this report's detail level.

### 3.5 KPI / stat tiles (lines 30–42 `Stat` component, rendered lines 66–75)
`Stat` component: icon in a rounded accent-colored badge box (`h-9 w-9 rounded-lg bg-accent text-accent-foreground`), plus a value/label stack (value: `text-lg font-semibold tabular-nums text-card-foreground`; label: `text-xs text-muted-foreground`). Card wrapper: `flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm` — same card visual language as elsewhere.

Grid: `<div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">` — 1 col mobile, 2 cols `sm`, 4 cols `lg`. Four tiles, in order:
1. **Total presences** — icon `CalendarCheck` — value = `players.reduce((s,p) => s + p.total, 0)` (sum of every player's `total` field, string-cast).
2. **Active players** — icon `Users` — value = `players.length` (count of mock roster, 25).
3. **Academy share** — icon `TrendingUp` — value = `Math.round((typeSplit[1].value / (total || 1)) * 100) + "%"` — i.e. Academy sum (`typeSplit[1]`) ÷ total presences × 100, rounded; `|| 1` guards divide-by-zero.
4. **Guest attendances** — icon `UserCheck` — value = `players.reduce((s,p) => s + p.invitesJoined, 0)` (sum of all `invitesJoined` across players — guests who joined via invite).

### 3.6 Main content stack (lines 77–80)
`<div className="space-y-6"><PresencesCharts /><PlayersTable /></div>` — charts render above the table, vertically stacked with 24px gap. No page-level date-range/week/class selector controls exist anywhere in `index.tsx` — all filtering is local to `PlayersTable`'s own toolbar; the charts have no filter controls and always show their fixed mock aggregates (top 8, full split, last 8 weeks) independent of the table's search/min/max state (i.e. table filters do NOT affect the charts — they are fully decoupled, separate data derivations from the same base `players` array).

### 3.7 Footer note (lines 82–84)
`<p className="mt-6 text-center text-xs text-muted-foreground">Prototype with mock data · {unjustified} unjustified absences recorded</p>` — `unjustified` = sum of every player's `unjustified` field (computed line 46, separate from the KPI tiles — this count is NOT one of the 4 stat tiles, only appears in this footer line).

### 3.8 Interactive element inventory (index.tsx level)
Beyond composing the two child components and `ValidateClasses`, `index.tsx` itself has no additional buttons/tabs/inputs — it's pure layout/composition + derived-stat computation.

### 3.9 Sidebar nav context (for completeness, from `__root.tsx` → `AppShell.tsx`)
The page is wrapped by `<AppShell>` (`src/components/AppShell.tsx`), which renders a left sidebar nav (not tabs) with 7 static items, only "Presences" marked `active: true` and only `/` (this route) implemented:
`Dashboard, Calendar, Players, Presences (active), Exercises, Chat, Definitions` — each with a lucide icon (`LayoutDashboard, CalendarDays, Users, ClipboardCheck, Dumbbell, MessageSquare, Settings`). Nav buttons currently have no real routing (`onClick={onNavigate}` just closes a mobile drawer) — this is a nav-shell mockup, not a tab bar, and no other page/tab exists in this reference repo besides Presences.

---

## 4. Data contracts

### `Player` type (`presences-data.ts:1-11`)
```ts
type Player = {
  id: string;
  name: string;
  total: number;
  private: number;
  academy: number;
  justified: number;
  unjustified: number;
  invitesReceived: number;
  invitesJoined: number;
};
```
`players: Player[]` — 25 entries, deterministically pseudo-randomized (seeded LCG, seed `20260821`) from a fixed Portuguese name list (`NAMES`, lines 13-39), so identical on every render/SSR pass. Per player: `private` = random 1–18, `academy` = random 2–27, `invitesReceived` = random 0–8, `invitesJoined` = random 0..invitesReceived, `total = private + academy + invitesJoined`, `justified` = random 0–5, `unjustified` = random 0–3.

### `ColumnKey` = `keyof Omit<Player, "id">` — the 8 sortable/filterable/exportable fields.

### `COLUMNS: { key: ColumnKey; label: string; numeric: boolean }[]` — column metadata (label text + numeric flag driving alignment/sort default), fixed order (table §1.8).

### `DEFAULT_VISIBLE: ColumnKey[]` — initial 5 visible columns.

### `topPlayers: { name: string; presences: number }[]` — derived, not raw `Player[]` (see §2.2).
### `typeSplit: { name: string; value: number }[]` — 2-entry aggregate (see §2.3).
### `weeklyPresences: { week: string; presences: number }[]` — 8-entry mock series (see §2.4).

**Data origin**: everything is client-side mock data generated at module load in `src/lib/presences-data.ts` — no API/fetch calls, no React Query usage for presences data (React Query is only wired up at the root level via `QueryClientProvider` for framework scaffolding, not used here). `PlayersTable` and `PresencesCharts` both import directly from this static module and take no props.

---

## 5. Every interactive element across all three files (consolidated)

| # | Element | File | Effect |
|---|---|---|---|
| 1 | Search input (player name) | PlayersTable | filter rows by name substring |
| 2 | Min. total presences number input | PlayersTable | filter rows, `total >= n` |
| 3 | Max. unjustified number input | PlayersTable | filter rows, `unjustified <= n` |
| 4 | "Columns" dropdown trigger | PlayersTable | opens column picker |
| 5 | Column visibility checkboxes (×8, 1 disabled) | PlayersTable | show/hide columns; Player forced on |
| 6 | "Export CSV" button | PlayersTable | downloads `presences.csv` of visible/filtered/sorted data |
| 7 | Column header click (×N visible) | PlayersTable | sort table by that column, toggle direction on repeat |
| 8 | Bar hover (Chart 1) | PresencesCharts | tooltip + cursor highlight |
| 9 | Pie slice hover (Chart 2) | PresencesCharts | tooltip |
| 10 | Line point hover (Chart 3) | PresencesCharts | tooltip + dot grows |
| 11 | `ValidateClasses` widget | index.tsx | out of scope (see §3.4) — separate investigation |
| 12 | Sidebar nav buttons (×7, from AppShell) | (wrapping layout, not in-scope files but visible in every render) | mock only — no real routing wired |

Rows in the table itself are **not** clickable (no row-click handler, no navigation to a player detail page) — hover only changes background color.

---

## 6. Visual / design details worth preserving

- **Card primitive**: every discrete block (PlayersTable section, each ChartCard, each Stat tile) uses the same recipe: `rounded-xl border border-border bg-card shadow-sm` (Stat tiles use `px-4 py-3`; table/chart cards use `p-5`). This is the dominant visual signature of the whole page.
- **Color tokens**: all chart strokes/fills reference CSS custom properties — `var(--border)`, `var(--muted)`, `var(--muted-foreground)`, `var(--card)`, `var(--card-foreground)`, `var(--chart-1)`, `var(--chart-2)` — theme-driven (light/dark aware), not hardcoded hex. Only 2 chart colors used across all 3 charts (`--chart-1` for bar+line, `--chart-1`/`--chart-2` for the two pie slices).
- **Typography scale**: page `h1` = `text-2xl font-semibold tracking-tight`; card `h2`/`h3` = `text-sm`/`text-base font-semibold`; helper/label text consistently `text-xs text-muted-foreground`; table header labels = `text-xs uppercase tracking-wide font-medium`; numeric cells use `tabular-nums` for column alignment (also used on Stat tile values).
- **Iconography (lucide-react)** used in these 3 files + directly-composed pieces:
  - PlayersTable: `ArrowDown`, `ArrowUp`, `ChevronsUpDown` (sort state), `Columns3` (columns button), `Download` (export button), `Search` (search input).
  - index.tsx Stat tiles: `CalendarCheck`, `TrendingUp`, `UserCheck`, `Users`.
  - AppShell nav (context only): `LayoutDashboard`, `CalendarDays`, `Users`, `ClipboardCheck`, `Dumbbell`, `MessageSquare`, `Settings`.
- **Spacing rhythm**: page container `max-w-7xl` with responsive `px-4/sm:px-6/lg:px-8`, `py-8`; sections stacked with `space-y-6`; KPI grid `gap-3`; chart grid `gap-4`; toolbar controls `gap-3`.
- **Chart card fixed height**: every chart is exactly `h-60` (240px) regardless of chart type, keeping the 3-chart row visually even.
- **Empty state copy**: table's only empty-state string is "No players match these filters." — plain, centered, muted, no icon or illustration.
- **No badges, pills, or avatars anywhere** in PlayersTable/PresencesCharts/index.tsx — worth explicitly noting since the task description assumed they might exist; the Stat tile's icon-in-rounded-box (`bg-accent text-accent-foreground`) is the closest visual to a "badge" but it's a fixed icon container, not a status/semantic-color pill.

---

## 7. UI primitives actually used vs. not used

Confirmed by import statements:
- **Used**: `Button`, `Input`, `Label`, `Checkbox`, `DropdownMenu*` (from `@/components/ui/`) in PlayersTable; none of the shadcn UI primitives in PresencesCharts (pure recharts); in index.tsx, only the local `Stat` helper (no shadcn primitive imports) plus `ValidateClasses` (which separately imports `Button`, `Checkbox`, `Dialog*`).
- **NOT used** by these 3 files despite existing in `src/components/ui/`: `table.tsx` (PlayersTable hand-rolls a raw `<table>` instead), `chart.tsx` (shadcn's recharts wrapper/theming helper — PresencesCharts calls recharts components directly and defines its own inline `tooltipStyle`/CSS-var approach instead), `tabs.tsx` (no tab UI anywhere in the Presences page — AppShell uses a sidebar list of buttons, not a `Tabs` component; there is only one implemented route), `badge.tsx`, `avatar.tsx` (used only in `AppShell.tsx` for a user-menu avatar, not in these 3 files).

This means: when porting to the real app, there's no existing "chart.tsx"/"table.tsx" theming convention being followed here to preserve — the reference implementation intentionally bypasses those primitives in favor of raw `<table>` + direct recharts + CSS-variable-driven styling.
