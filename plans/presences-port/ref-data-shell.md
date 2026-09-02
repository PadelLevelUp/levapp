# Reference Codebase Report — Data Layer & App Shell
Base dir: `/Users/pedropacheco1/Documents/Projetos/padel_app/levelup/reference/Presence Overview`

---

## 1. THE DATA MODEL

### 1.1 `src/lib/presences-data.ts` (107 lines) — per-player presence aggregate stats

This file models **aggregate attendance counters per player** (not individual attendance events). It has no relation to `classes-data.ts` at the type level — the two files model different granularities of the same domain (per-class rosters vs. per-player rollups) and are NOT cross-referenced or derived from one another; their player name pools even differ slightly (`NAMES` here is a 25-name subset of the 63-name `STUDENT_POOL` in classes-data.ts).

**Type `Player`** (`presences-data.ts:1-11`):
```ts
export type Player = {
  id: string;              // e.g. "p-1" — synthetic, index-based, NOT a UUID
  name: string;             // full display name, e.g. "Miguel Ferreira"
  total: number;            // private + academy + invitesJoined (derived, see below)
  private: number;          // count of private-class presences
  academy: number;          // count of academy-class presences
  justified: number;        // count of justified absences
  unjustified: number;      // count of unjustified absences
  invitesReceived: number;  // count of invites received (to join other classes)
  invitesJoined: number;    // count of received invites the player actually joined
};
```
Every field is required (no optionals). All numeric fields are plain `number` — no currency/credit/balance semantics anywhere in this file (confirms: **no credit/balance/make-up logic exists** in this reference app).

**Constant `NAMES`** (`presences-data.ts:13-39`): a hardcoded array of 25 Portuguese full names (e.g. "Miguel Ferreira", "Ana Rodrigues", … "Vasco Amaral"). Pure display-name seed data, no IDs/emails/phone attached.

**Deterministic PRNG — `makeRandom(seed)`** (`presences-data.ts:42-48`):
```ts
function makeRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = makeRandom(20260821);
```
This is a classic **LCG (linear congruential generator)** with the Numerical-Recipes constants (`a=1664525`, `c=1013904223`, `m=2^32`), seeded with the literal `20260821` (looks like an encoded date, YYYYMMDD = 2026-08-21). The comment explicitly states the purpose: *"Deterministic pseudo-random so SSR and client render the same mock data."* This is the mechanism that keeps server-rendered and client-hydrated mock data byte-identical (a real concern in TanStack Start SSR — `Math.random()` would cause hydration mismatches). A single shared `rand` closure is reused sequentially across all downstream generation (players, then weeklyPresences), so **call order matters** — reordering statements changes all subsequent output.

**Exported constant `players: Player[]`** (`presences-data.ts:52-68`) — the core mock dataset, one record per name in `NAMES` (25 records):
```ts
export const players: Player[] = NAMES.map((name, i) => {
  const priv = Math.floor(rand() * 18) + 1;                 // 1–18
  const academy = Math.floor(rand() * 26) + 2;               // 2–27
  const invitesReceived = Math.floor(rand() * 9);            // 0–8
  const invitesJoined = Math.floor(rand() * (invitesReceived + 1)); // 0..invitesReceived
  return {
    id: `p-${i + 1}`,
    name,
    total: priv + academy + invitesJoined,   // ← derived, NOT independently random
    private: priv,
    academy,
    justified: Math.floor(rand() * 6),        // 0–5
    unjustified: Math.floor(rand() * 4),      // 0–3
    invitesReceived,
    invitesJoined,
  };
});
```
Business rule embedded here: **`total` is always exactly `private + academy + invitesJoined`** — i.e., a player's total presence count includes private classes, academy classes, and classes joined via invite, but explicitly EXCLUDES invites received-but-not-joined. `justified`/`unjustified` absence counts are independent random draws, not subtracted from `total` (absences are tracked separately from presence counts, not netted against them). `invitesJoined` is always ≤ `invitesReceived` by construction (drawn from `[0, invitesReceived]` inclusive).

Example record shape (values will vary per the LCG sequence, but structurally):
```ts
{ id: "p-1", name: "Miguel Ferreira", total: 23, private: 9, academy: 12, justified: 3, unjustified: 1, invitesReceived: 4, invitesJoined: 2 }
```

**Derived constant `topPlayers`** (`presences-data.ts:70-76`) — leaderboard view, top 8 by total presences:
```ts
export const topPlayers = [...players]
  .sort((a, b) => b.total - a.total)
  .slice(0, 8)
  .map((p) => {
    const [first = "", last = ""] = p.name.split(" ");
    return { name: `${first} ${last.charAt(0)}.`, presences: p.total };
  });
```
Shape: `{ name: string; presences: number }[]`, length 8. Name is anonymized to "First L." format (first name + last-initial + period) — e.g. "Miguel F.". This is clearly chart/leaderboard-widget data (likely a bar chart, given `chart-*` CSS tokens exist).

**Derived constant `typeSplit`** (`presences-data.ts:78-81`) — pie/donut chart data, sums across all players:
```ts
export const typeSplit = [
  { name: "Private", value: players.reduce((s, p) => s + p.private, 0) },
  { name: "Academy", value: players.reduce((s, p) => s + p.academy, 0) },
];
```
Shape: `{ name: string; value: number }[]`, exactly 2 entries. Aggregate total private-class vs. academy-class presence counts across the whole player base.

**Derived constant `weeklyPresences`** (`presences-data.ts:83-86`) — trend-line/bar chart data, 8 synthetic weeks:
```ts
export const weeklyPresences = Array.from({ length: 8 }, (_, i) => ({
  week: `W${i + 1}`,
  presences: 48 + Math.floor(rand() * 40) + i * 3,
}));
```
Shape: `{ week: string; presences: number }[]`, length 8 (`W1`..`W8`). Formula: base 48, + random 0-39, + a linear upward drift of `i*3` per week — i.e. mock data is deliberately trending upward over the 8 weeks (W1 ≈ 48-90, W8 ≈ 69-108), presumably to make a demo trend chart look like growth. **Not tied to any real calendar week** — just sequential labels.

**Type `ColumnKey`** (`presences-data.ts:88`): `keyof Omit<Player, "id">` — i.e. any Player field except `id` (8 possible values: name, total, private, academy, justified, unjustified, invitesReceived, invitesJoined).

**Constant `COLUMNS`** (`presences-data.ts:90-99`) — table column registry for a configurable/sortable presences table:
```ts
export const COLUMNS: { key: ColumnKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Player", numeric: false },
  { key: "total", label: "Total presences", numeric: true },
  { key: "private", label: "Private classes", numeric: true },
  { key: "academy", label: "Academy classes", numeric: true },
  { key: "justified", label: "Justified absences", numeric: true },
  { key: "unjustified", label: "Unjustified absences", numeric: true },
  { key: "invitesReceived", label: "Invites received", numeric: true },
  { key: "invitesJoined", label: "Joined as invite", numeric: true },
];
```
This defines all 8 possible columns for a data table component, with human-readable labels and a `numeric` flag (for right-alignment / sort-direction defaults, presumably).

**Constant `DEFAULT_VISIBLE`** (`presences-data.ts:101-107`):
```ts
export const DEFAULT_VISIBLE: ColumnKey[] = [
  "name", "total", "private", "academy", "unjustified",
];
```
The default column-visibility subset (5 of 8 columns) — implies a column-picker/toggle UI exists elsewhere for the presences table (consistent with a "customize columns" feature), defaulting to hiding `justified`, `invitesReceived`, `invitesJoined`.

---

### 1.2 `src/lib/classes-data.ts` (227 lines) — per-class occurrences + roster/attendance-response tracking

This is the richer, event-level model: individual class occurrences, each with a roster of students and each student's RSVP/attendance state.

**Type `Response`** (`classes-data.ts:1`):
```ts
export type Response = "confirmed" | "absent" | "none" | "added";
```
This is the **pre-class RSVP state** — whether a student has responded to/confirmed a class invitation before it happens. Semantics:
- `"confirmed"` — student confirmed they're attending
- `"absent"` — student said they will NOT attend (pre-emptive absence notice)
- `"none"` — no response yet (default/pending state)
- `"added"` — student was added directly by the coach (bypassing the RSVP flow, e.g. a walk-in or manual roster edit)

**Type `Status`** (`classes-data.ts:2`):
```ts
export type Status = "present" | "justified" | "unjustified";
```
This is the **post-class actual-attendance state**, recorded by the coach after/during the class (this is the "presence taking" outcome). Three values: attended, absent-with-a-justification, absent-without-justification. This is a DIFFERENT state machine from `Response` — `Response` is what the student said beforehand, `Status` is what the coach records afterward. The mapping between them is NOT automatic/1:1: only some `Response` values pre-fill a `Status` (see `prefillStatus` below), and even that pre-fill is presumably editable by the coach before finalizing.

**Type `ClassStudent`** (`classes-data.ts:4-8`):
```ts
export type ClassStudent = {
  id: string;        // e.g. "c1-s0" (classId + "-s" + index)
  name: string;
  response: Response;
};
```
Note: `ClassStudent` carries the pre-class `Response` but does NOT carry a `Status` field — attendance-taking `Status` is apparently computed/entered live (via `prefillStatus`) rather than stored in the mock data model, i.e. this reference app models the "before attendance is taken" state; the actual per-student `Status` would be transient UI state (likely a `useState`/form in whatever component consumes this — not visible in these two files).

**Type `PadelClass`** (`classes-data.ts:10-19`):
```ts
export type PadelClass = {
  id: string;
  weekOffset: number;  // 0 = this week, -1 = last week
  dayIndex: number;    // 0 = Monday
  time: string;         // "HH:MM" 24h string, e.g. "09:00"
  name: string;          // display name, e.g. "Private — Miguel"
  type: "Private" | "Academy";
  court: string;          // e.g. "Court 1".."Court 4"
  students: ClassStudent[];
};
```
Key design choice: dates are **NOT absolute** — a class occurrence is located by `(weekOffset, dayIndex, time)` relative to "now" (the current real-world week), not by a stored calendar date. This is again an SSR-determinism trick (see `weekLabel` below, which computes actual dates from `weekOffset` at render time using `new Date()`). `dayIndex` uses ISO-ish Monday=0 convention (not JS's native Sunday=0), matching `DAY_NAMES`.

**Constant `DAY_NAMES`** (`classes-data.ts:21-29`): `["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]` — 7 entries, Monday-first, indexed 0-6 to match `dayIndex`.

**Constant `STUDENT_POOL`** (`classes-data.ts:31-95`): 63 hardcoded Portuguese names (a superset/different list than `presences-data.ts`'s 25 `NAMES` — 18 names overlap, e.g. "Miguel Ferreira", "Ana Rodrigues", but many are unique to this pool e.g. "Guilherme Sousa", "Margarida Oliveira"). Used as a rotating pool for roster generation (see `roster()` below) — students are assigned by modulo-indexing into this pool, so the SAME name can appear as a roster member of multiple different classes (there's no global identity/dedup — `STUDENT_POOL` names are NOT the same objects/IDs as `presences-data.ts` `players`; they're two independently-seeded mock datasets that happen to share a naming convention).

**Helper `roster()`** (`classes-data.ts:97-118`) — generates a class's student list with a controllable mix of response states:
```ts
function roster(classId: string, total: number, none: number, absent: number, offset: number): ClassStudent[] {
  const out: ClassStudent[] = [];
  for (let i = 0; i < total; i++) {
    let response: Response;
    if (i < none) response = "none";
    else if (i < none + absent) response = "absent";
    else response = "confirmed";
    const poolIndex = (offset + i) % STUDENT_POOL.length;
    out.push({ id: `${classId}-s${i}`, name: STUDENT_POOL[poolIndex]!, response });
  }
  return out;
}
```
Algorithm: builds `total` students; the first `none` get `response: "none"`, the next `absent` get `response: "absent"`, and the remainder get `response: "confirmed"`. Note: **no student is ever seeded with `response: "added"`** in the mock data — `"added"` is presumably only reachable via live coach interaction (adding a walk-in), not part of the initial seed. Names are assigned deterministically by walking `STUDENT_POOL` starting at `offset` (wrapping via modulo), so different classes get different (but overlapping) student rosters depending on their `offset` argument. Student IDs are `${classId}-s${index}` (e.g. `"c1-s0"`, `"c1-s1"`).

**Helper `mk()`** (`classes-data.ts:120-143`) — thin factory/constructor combining a `PadelClass`'s scalar fields with a generated roster (calls `roster()` internally). Pure convenience for the seed array below; no business logic beyond composition.

**Exported constant `classes: PadelClass[]`** (`classes-data.ts:145-187`) — the seed dataset: **24 classes** total (`c1`..`c24`), organized as:
- **This week (`weekOffset: 0`)**: 19 classes across all 7 days — Monday 3, Tuesday 3, Wednesday 3, Thursday 2, Friday 3, Saturday 3, Sunday 2 (comments in the source explicitly label each day's block).
- **Last week (`weekOffset: -1`)**: 2 classes (`c20`, `c21`).
- **Next week (`weekOffset: 1`)**: 3 classes (`c22`, `c23`, `c24`).

Each class alternates between `type: "Private"` (named e.g. `"Private — Miguel"`, `"Private — Costa"`, small rosters of 12, courts 1-2 mostly) and `type: "Academy"` (named e.g. `"Academy Level 2"`, `"Academy Beginners"`, `"Academy Kids"`, `"Academy Adults"`, larger rosters of 13-16, courts 2-4). Roster sizes range 12-16 students; most classes have `none: 0` (fully responded) except a few (e.g. `c2` Academy Level 2 Monday has `none: 2`, `c8` Academy Kids Wednesday has `none: 1`) — this variety is presumably to demo both "ready to take attendance" and "still waiting on responses" UI states. Full example (first record, `classes-data.ts:147`):
```ts
mk("c1", 0, 0, "09:00", "Private — Miguel", "Private", "Court 1", 12, 0, 1, 0)
// → { id:"c1", weekOffset:0, dayIndex:0, time:"09:00", name:"Private — Miguel",
//     type:"Private", court:"Court 1",
//     students: [ {id:"c1-s0", name: STUDENT_POOL[0], response:"confirmed"},  // none=0,absent=1 → index 0 is past none(0) and past absent(1)? wait recompute
//     ... 12 students, 0 "none", 1 "absent", 11 "confirmed" ]}
```
(Re-checking against `roster()`: for `mk("c1",...,12,0,1,0)` → total=12, none=0, absent=1, offset=0: student 0 → i=0 not <none(0), not <none+absent(1)... wait i=0 < 1 → "absent". So student 0 is absent, students 1-11 are confirmed. Correcting the example: `students[0] = {id:"c1-s0", name: STUDENT_POOL[0]="Miguel Ferreira", response:"absent"}`, `students[1..11]` = confirmed, names from `STUDENT_POOL[1..11]`.)

Second full example (`classes-data.ts:148`, an Academy class with pending responses):
```ts
mk("c2", 0, 0, "18:30", "Academy Level 2", "Academy", "Court 3", 16, 2, 1, 8)
// total=16, none=2, absent=1, offset=8
// → students[0..1]: response "none"  (STUDENT_POOL[8], STUDENT_POOL[9])
//   students[2]:     response "absent" (STUDENT_POOL[10])
//   students[3..15]: response "confirmed" (STUDENT_POOL[11..23 wrapped])
```

**Function `prefillStatus(response)`** (`classes-data.ts:189-194`) — the RSVP→attendance business rule bridging `Response` to `Status`:
```ts
export function prefillStatus(response: Response): Status | null {
  if (response === "confirmed") return "present";
  if (response === "absent") return "justified";
  if (response === "added") return "present";
  return null;
}
```
Business rule: when the coach opens the attendance-taking UI, each student's `Status` is pre-filled from their pre-class `Response` as a time-saving default (presumably still editable): `confirmed`→`present`, `absent`→`justified` (a student who proactively said they'd be absent is assumed to have a valid excuse, defaulting to justified rather than unjustified), `added`→`present` (a coach-added walk-in is assumed present), and `none` (no response) → `null`, i.e. **no default — the coach must explicitly decide** for students who never responded. This is the core "make attendance-taking fast" UX logic of the whole feature.

**Function `summarize(c: PadelClass)`** (`classes-data.ts:196-201`) — per-class RSVP summary/readiness check:
```ts
export function summarize(c: PadelClass) {
  const confirmed = c.students.filter((s) => s.response === "confirmed").length;
  const absent = c.students.filter((s) => s.response === "absent").length;
  const none = c.students.filter((s) => s.response === "none").length;
  return { total: c.students.length, confirmed, absent, none, ready: none === 0 };
}
```
Returns `{ total, confirmed, absent, none, ready: boolean }`. Business rule: a class is "**ready**" (presumably to have attendance taken, or ready for the coach's review) exactly when **zero students have `response: "none"`** — i.e., everyone has responded one way or another (confirmed/absent/added all count as "responded"; only "none" blocks readiness). This directly powers the `ready` boolean surfaced in `summarize`'s return, likely driving a badge/indicator in a class list UI.

**Function `weekLabel(offset: number)`** (`classes-data.ts:203-214`) — human-readable week range label:
```ts
export function weekLabel(offset: number) {
  const base = new Date();
  const day = (base.getDay() + 6) % 7;        // convert JS Sun=0 to Mon=0
  const monday = new Date(base);
  monday.setDate(base.getDate() - day + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const name = offset === 0 ? "This week" : offset === -1 ? "Last week" : offset === 1 ? "Next week" : `Week ${offset > 0 ? "+" : ""}${offset}`;
  return `${name} · ${fmt(monday)} – ${fmt(sunday)}`;
}
```
Algorithm: computes the real-world Monday for the given `weekOffset` relative to today (`(base.getDay()+6)%7` is the standard Sun=0→Mon=0 remap trick), then the following Sunday, and formats both as `"D MMM"` (en-GB locale, e.g. "21 Aug"). Produces labels like `"This week · 24 Aug – 30 Aug"`, `"Last week · 17 Aug – 23 Aug"`, `"Next week · 31 Aug – 6 Sep"`, or generically `"Week +2 · …"` for further-out offsets. **This is a live/real-time computation** (uses `new Date()` at call time, not seeded) — unlike the rest of the mock data it will differ between SSR and client renders if the day rolls over mid-session, and will differ from run to run (not part of the deterministic-seed system). It's presumably called at render time in a component, not memoized at module scope like the `presences-data.ts` constants.

**Constants `RESPONSE_LABEL` and `STATUS_LABEL`** (`classes-data.ts:216-227`) — human-readable label lookups:
```ts
export const RESPONSE_LABEL: Record<Response, string> = {
  confirmed: "Confirmed attending",
  absent: "Said absent",
  none: "No answer",
  added: "Added by coach",
};
export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  justified: "Absent – justified",
  unjustified: "Absent – unjustified",
};
```
Straightforward enum→display-string maps for UI badges/labels.

---

## 2. Is the data static mock or fetched? Where would a real API plug in? Persistence?

**Fully static, in-memory mock data — confirmed by exhaustive grep.** I ran `grep -rn "localStorage\|sessionStorage\|createServerFn\|fetch("` across all of `src/**/*.ts*`; the only `fetch(` hits are the SSR request-handler's `Request`/`Response` fetch signature in `src/server.ts:48-51` (TanStack Start's server entry contract, `(request, env, ctx) => Response`), which is infrastructure-level, not data-fetching for the app's domain data.

- **No `localStorage`/`sessionStorage`** anywhere — no client-side persistence at all. Any UI state (e.g. attendance being taken, column visibility toggles) would be pure in-memory React state, lost on refresh.
- **No TanStack Start server functions** (`createServerFn`) exist in the codebase despite `@tanstack/react-start` being a dependency and `RootComponent` wrapping everything in a `QueryClientProvider` (`__root.tsx:1,122`) — the query-client plumbing is present but **unused**; nothing in these files calls `useQuery`/`useMutation`. This strongly signals the app is scaffolded for a future real backend but currently ships 100% synthetic data computed at module-import time.
- **Where an API would plug in**: `players`, `topPlayers`, `typeSplit`, `weeklyPresences` (presences-data.ts) and `classes` (classes-data.ts) are the natural seams — each is a plain exported array/const computed once at import. A real integration would replace these module-level `const`s with `useQuery(...)` hooks (or TanStack Start server-function loaders in route `loader`s) returning the same shapes; the `Player`, `PadelClass`, `ClassStudent`, `Response`, `Status` types are already the wire-contract candidates. `prefillStatus`, `summarize`, and `weekLabel` are pure functions independent of data source and would carry over unchanged. `COLUMNS`/`DEFAULT_VISIBLE`/`RESPONSE_LABEL`/`STATUS_LABEL` are UI config, not fetched data, and would stay client-side regardless.
- The deterministic-seed LCG pattern (`makeRandom`) exists specifically because there's no server to be the single source of truth — it's a workaround for SSR/CSR hydration parity on mock data, and would become unnecessary once real fetched data replaces it.

---

## 3. App shell & navigation (`src/components/AppShell.tsx`, 137 lines)

**Structure**: A single `AppShell` component (`AppShell.tsx:88-136`) wrapping `{children}` (the routed page content), composed from three local sub-components: `NavList`, `Brand`, `ProfileMenu`.

**Nav model — constant `NAV`** (`AppShell.tsx:22-30`):
```ts
const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: false },
  { label: "Calendar", icon: CalendarDays, active: false },
  { label: "Players", icon: Users, active: false },
  { label: "Presences", icon: ClipboardCheck, active: true },
  { label: "Exercises", icon: Dumbbell, active: false },
  { label: "Chat", icon: MessageSquare, active: false },
  { label: "Definitions", icon: Settings, active: false },
];
```
7 tabs total: Dashboard, Calendar, Players, **Presences (active/current page)**, Exercises, Chat, Definitions. Each entry pairs a `lucide-react` icon component with a label and a hardcoded `active` boolean — **this is static, not routed**: `active` is NOT derived from the current URL/route (there's no `useLocation`/`useMatch` call anywhere in this file), it's simply hand-set to `true` for "Presences" since this reference build IS the Presences page. In a multi-page real app, this would need to become route-aware. None of the nav buttons have real navigation attached — `NavList`'s buttons (`AppShell.tsx:36-51`) call `onClick={onNavigate}` where `onNavigate` is an optional prop (used only to close a mobile drawer, presumably — though no drawer/sheet is actually wired up in this file, `onNavigate` is passed but never supplied by `AppShell`, i.e. `NavList` is called as `<NavList />` at `AppShell.tsx:94` with no `onNavigate`, so it's fully inert). The **mobile bottom nav buttons** (`AppShell.tsx:116-131`) don't even have `onClick` — pure static/decorative. So navigation between the 7 tabs isn't actually implemented — the shell only visually represents the tab set; this confirms the reference build is scoped to the Presences page only, matching `routeTree.gen.ts` having exactly one route (`/`).

**Layout**:
- **Desktop**: fixed left sidebar (`<aside>`, `AppShell.tsx:92-95`), `w-60` (15rem), `hidden` below `lg:` breakpoint, shown as `lg:flex` — contains `Brand` (logo+name) then `NavList`. Main content area offset via `lg:pl-60` (`AppShell.tsx:97`).
- **Header**: `sticky top-0` bar, `h-14`, `border-b`, `bg-background/80 backdrop-blur` (translucent blur header) — on mobile shows a small brand mark + "Presences" title (`lg:hidden`, `AppShell.tsx:99-104`); on desktop shows just "Presences" as plain text (`lg:block`, `AppShell.tsx:105`, hidden on mobile). `ProfileMenu` sits at the far right (`ml-auto`) on both.
- **Mobile bottom nav**: `<nav>` fixed to viewport bottom (`fixed inset-x-0 bottom-0 z-40`), `lg:hidden` (mobile-only), horizontally scrollable (`overflow-x-auto`, `snap-x snap-mandatory`) with scrollbar hidden via `[scrollbar-width:none]` / `[&::-webkit-scrollbar]:hidden` — explicitly commented "horizontally scrollable for >5 tabs" (`AppShell.tsx:113`) since there are 7 tabs and mobile can't fit them all. A right-edge fade gradient (`AppShell.tsx:133`, `pointer-events-none absolute … bg-gradient-to-l from-card to-transparent`) hints to the user there's more to scroll.
- **Content**: page children rendered inside `<div className="pb-20 lg:pb-0">` (`AppShell.tsx:110`) — bottom padding on mobile reserves space so content isn't hidden behind the fixed bottom nav; removed on desktop where there's no bottom nav.

**Responsive breakpoint**: everything pivots on Tailwind's `lg:` breakpoint (desktop sidebar+header-title vs. mobile bottom-nav+header-brand). No `md:`/`sm:` intermediate nav treatment — it's a binary sidebar/bottom-bar switch.

**Interactive elements**:
1. 7× desktop sidebar nav buttons (`NavList`, visually styled active/inactive, `aria-current="page"` on the active one, but click handler is a no-op stub).
2. 7× mobile bottom-nav buttons (same NAV data, no click handler at all).
3. `ProfileMenu` — a `DropdownMenu` (shadcn/Radix) triggered by an avatar+name pill (`AppShell.tsx:70-75`, avatar fallback initials "TP", name "Tomas P." — hardcoded fake logged-in coach), containing: "Coach account" label, separator, "Profile", "Preferences" menu items, separator, "Log out" — none of these items have `onClick` handlers either (`AppShell.tsx:79-82`), purely decorative/scaffolded.

**Theming**: Uses semantic Tailwind classes throughout (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-accent`/`text-accent-foreground`, `border-border`) which map to CSS custom properties — dark mode IS supported at the token level (see §6, `.dark` class overrides in `styles.css`), but `AppShell.tsx` itself contains no dark-mode toggle UI — theme switching isn't exposed anywhere in the shell (no sun/moon icon, no toggle in `ProfileMenu`). Dark mode would presumably be activated by adding a `.dark` class to `<html>`/`<body>`, which nothing in this codebase does.

**Brand** (`AppShell.tsx:56-65`): "PadelCoach" wordmark with a square "P" monogram badge (`bg-primary`), shown full-size in the desktop sidebar and as a smaller variant in the mobile header.

---

## 4. Routing (`src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/__root.tsx`)

**Framework**: TanStack Router (via TanStack Start), file-based routing with a code-generated route tree.

**`router.tsx`** (16 lines) — the router factory:
```ts
export const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
  return router;
};
```
Creates a fresh `QueryClient` per router instance (correct for SSR — avoids cross-request cache leakage), injects it into router context (consumed via `Route.useRouteContext()` in `RootComponent`, `__root.tsx:119`), enables scroll restoration, and disables preload staleness caching (`defaultPreloadStaleTime: 0` — every preload is considered stale immediately, i.e. preloads always refetch rather than reusing a cached preload).

**`routeTree.gen.ts`** (69 lines, auto-generated, `@ts-nocheck`, explicitly "do NOT make changes") — currently registers exactly **ONE route**: `IndexRoute` at path `/` (`routeTree.gen.ts:12-18`), parented under the root route from `./routes/__root`. `FileRoutesByFullPath`/`FileRoutesByTo`/`FileRoutesById`/`FileRouteTypes` all only enumerate `'/'` — confirming this reference build is single-page (just the Presences dashboard at `/`), with the router type registration wired for SSR (`declare module '@tanstack/react-start' { interface Register { ssr: true; router: ...; config: ... } }`, `routeTree.gen.ts:63-69`).

**`__root.tsx`** (129 lines) — the root route definition:
- `createRootRouteWithContext<{ queryClient: QueryClient }>()` (`__root.tsx:76`) — typed context requiring a `queryClient`, matching what `router.tsx` provides.
- `head()` config (`__root.tsx:77-97`) sets document `<meta>`/`<link>` tags: charset, viewport, generic title "Lovable App" / description "Lovable Generated Project" / author "Lovable" (unbranded/unmodified placeholder metadata — OG tags and Twitter card also say "Lovable"), stylesheet link to `../styles.css?url` (`__root.tsx:12,93` — Vite's `?url` import suffix), and favicon.
- `shellComponent: RootShell` (`__root.tsx:104-116`) — the outermost HTML document shell (`<html lang="en"><head><HeadContent/></head><body>{children}<Scripts/></body></html>`) — this is TanStack Start's SSR document wrapper, rendered once around the whole app.
- `component: RootComponent` (`__root.tsx:118-129`) — wraps `<AppShell><Outlet/></AppShell>` in a `QueryClientProvider`. The comment at `__root.tsx:124` warns: *"Required: nested routes render here. Removing `<Outlet />` breaks all child routes."*
- `notFoundComponent: NotFoundComponent` (`__root.tsx:16-36`) — simple centered 404 page with a "Go home" link back to `/`.
- `errorComponent: ErrorComponent` (`__root.tsx:38-74`) — centered error boundary UI with "Try again" (calls `router.invalidate()` + the TanStack-provided `reset()`) and "Go home" actions; also fires `reportLovableError(error, { boundary: "tanstack_root_error_component" })` in a `useEffect` for Lovable's own error telemetry.

**Params/search-params**: **None exist.** There is exactly one static route (`/`) with no path params and no search-param schema defined anywhere in these files. Filters are NOT stored in the URL — any filtering/sorting/week-navigation UI implied by the data layer (e.g. `weekOffset` selection, `COLUMNS`/`DEFAULT_VISIBLE` toggling) would have to be local component state (`useState`) rather than URL-driven, since there's no `validateSearch`/`useSearch` usage in scope. (Note: `src/routes/index.tsx` itself — the actual page component consuming this data — was not in my assigned file list, so I can't confirm what local state it uses, but the routing layer itself provides no URL-state mechanism.)

---

## 5. Tech stack inventory (`package.json`)

**Framework/meta-framework**: **TanStack Start** (`@tanstack/react-start@1.168.32`) — full-stack React framework with SSR, built on **TanStack Router** (`@tanstack/react-router@1.170.18`, exact-pinned) + `@tanstack/router-plugin@1.168.23`. This is a notable divergence from a "standard" setup — **NOT React Router**, and not a plain SPA/CSR Vite app; it has a real server entry (`server.ts`) and SSR document shell (`__root.tsx`'s `shellComponent`).

**Build tooling**: Vite **8.1.5** (very recent major — standard React+Vite apps are often still on Vite 5/6/7) via `@lovable.dev/vite-tanstack-config` (`^2.15.0`, Lovable's own preset wrapping TanStack Start + Tailwind + React + Nitro + path-aliasing + sandbox detection — see `vite.config.ts` comment). Server output target is **Nitro** (`nitro@3.0.260603-beta` — a beta prerelease version) defaulting to Cloudflare per the vite.config.ts comment, though `vite.config.ts:11-13` explicitly redirects the server entry to the custom `src/server.ts` wrapper. `overrides: { rolldown: "1.2.1" }` (`package.json:14-16`) forces Rolldown (the Rust-based Vite/Rollup successor bundler) — another bleeding-edge-toolchain signal.

**UI/component library**: shadcn/ui (**"new-york" style**, per `components.json:3`), built on Radix UI primitives — a very large set of `@radix-ui/react-*` packages (accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toggle, toggle-group, tooltip — 24 Radix packages total), plus `class-variance-authority` (variant styling), `clsx` + `tailwind-merge` (className utilities, consumed by the `cn()` helper used throughout `AppShell.tsx`), `cmdk` (command palette), `vaul` (drawer/sheet primitive), `embla-carousel-react` (carousel), `input-otp` (OTP input), `react-resizable-panels` (resizable panel groups). This is the standard shadcn/ui component surface, just unusually complete (nearly every shadcn component is installed as a dependency, suggesting a broad Lovable component scaffold rather than an app that hand-picked only what it uses).

**Styling**: **Tailwind CSS v4** (`tailwindcss@^4.2.1`, `@tailwindcss/vite@^4.2.1`) — the CSS-first v4 config style (`@import "tailwindcss"`, `@theme inline` block in `styles.css`, no `tailwind.config.js`/`.ts` present in the file list I was given) rather than the v3 JS-config approach. Plus `tw-animate-css@^1.3.4` (Tailwind-compatible animation utility classes, the modern replacement for `tailwindcss-animate` under v4).

**Charts**: `recharts@^2.15.4` — confirms the chart-shaped mock data (`topPlayers`, `typeSplit`, `weeklyPresences`) is destined for Recharts components (bar chart, pie/donut chart, line/bar trend chart respectively), consistent with the `--chart-1`..`--chart-5` CSS tokens in `styles.css`.

**Dates**: `date-fns@^4.1.0` is a dependency, though `classes-data.ts`'s `weekLabel()` doesn't actually use it — it hand-rolls date math with native `Date` + `toLocaleDateString`. `date-fns` may be used elsewhere (e.g. `react-day-picker@^9.14.0`, a calendar/date-picker component, depends on it) but isn't exercised in the two data files reviewed.

**State/data-fetching**: `@tanstack/react-query@^5.101.1` is present and wired into the root component (`QueryClientProvider`) but, per §2, **completely unused** for actual data fetching in this reference build — all domain data is static synchronous module exports.

**Forms/validation**: `react-hook-form@^7.71.2` + `@hookform/resolvers@^5.2.2` + `zod@^3.24.2` — standard shadcn form stack, not exercised in the files reviewed here (no forms exist in AppShell/routing/data files).

**Icons**: `lucide-react@^0.575.0` (matches `components.json`'s `"iconLibrary": "lucide"`).

**Notifications**: `sonner@^2.0.7` (toast library).

**React**: `react@^19.2.0` / `react-dom@^19.2.0` — React 19.

**Dev tooling**: ESLint 9 (flat config style, `@eslint/js`, `typescript-eslint@^8.56.1`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-prettier`+`eslint-config-prettier`), Prettier 3.7.3, TypeScript ^5.8.3, `vite-tsconfig-paths` for the `@/*` path alias.

**Summary of what differs from a "standard React+Vite+Tailwind+shadcn/ui+React Router+TanStack Query" app**:
1. **Router is TanStack Router/Start, not React Router** — full SSR meta-framework with a custom server entry (`server.ts`), not a plain CSR SPA.
2. **Tailwind v4** (CSS-first `@theme`/`@import` config) rather than v3's JS config file.
3. **TanStack Query is installed and plumbed in but entirely unused** for the reviewed page — all data is static mock, not fetched.
4. **Vite 8 + Rolldown override + Nitro (beta) server build** — bleeding-edge/prerelease toolchain versions, atypical for a "standard" stable app.
5. Build/dev tooling is wrapped by a proprietary preset (`@lovable.dev/vite-tanstack-config`) that hides most of the actual Vite plugin configuration (devtools, SSR entry, Tailwind, path aliases, React/TanStack dedupe, error-logging, sandbox detection) — you can't see the real Vite config without inspecting that package.
6. Custom error-handling layer not typical of a scaffold: `start.ts`'s CSRF+error middleware, `server.ts`'s h3-swallowed-error normalization (detects a specific h3 framework quirk — 500 responses with JSON body `{"unhandled":true,"message":"HTTPError"}` — and replaces them with a proper error page), and `lovable-error-reporting.ts`/`error-capture.ts`/`error-page.ts` (Lovable's own telemetry hooks) — all Lovable-platform-specific infrastructure layered on top of TanStack Start.

---

## 6. Design tokens (`src/styles.css`, 163 lines)

**Tailwind v4 CSS-first setup**: `@import "tailwindcss" source(none)` + `@source "../src"` (explicit content-source scanning path) + `@import "tw-animate-css"` (`styles.css:1-3`), plus `@custom-variant dark (&:is(.dark *))` (`styles.css:5`) — defines the `dark:` variant to activate whenever an ancestor has the `.dark` class (class-based dark mode, not `prefers-color-scheme`-based).

**Color format**: All colors are declared in **oklch()** — explicitly mandated by the file's own header comment (`styles.css:14`, *"All colors MUST use oklch format"*) — a perceptually-uniform color space, increasingly standard in Tailwind v4 projects.

**Radius scale** (`styles.css:22-28`): a single base `--radius: 0.625rem` (10px, `:root`, line 72) drives a full scale via `calc()`: `--radius-sm` (base−4px=6px), `--radius-md` (base−2px=8px), `--radius-lg` (base=10px), `--radius-xl` (base+4px=14px), `--radius-2xl` (+8px=18px), `--radius-3xl` (+12px=22px), `--radius-4xl` (+16px=26px) — changing one variable rescales the whole radius system.

**Semantic color tokens** (mapped `@theme inline` → Tailwind utilities at `styles.css:29-67`, then defined as actual oklch values per-mode):
- Core: `background`/`foreground`, `card`/`card-foreground`, `popover`/`popover-foreground`
- Brand: `primary`/`primary-foreground`, `secondary`/`secondary-foreground`
- Neutral: `muted`/`muted-foreground`, `accent`/`accent-foreground`
- Feedback: `destructive`/`destructive-foreground`, `success`/`success-foreground`, `warning`/`warning-foreground`, `danger`/`danger-foreground` (note: BOTH `destructive` AND `danger` exist as distinct token pairs — likely `destructive` is the shadcn-standard token used by Button/Alert variants, while `success`/`warning`/`danger` are a custom traffic-light triad added on top, presumably for the attendance-status badges: present=success-ish, justified=warning-ish, unjustified=danger-ish — though nothing in the two data files directly proves that mapping, it's the obvious intended use given `STATUS_LABEL`'s three values).
- Structural: `border`, `input`, `ring`, `ring-offset-background`
- Charts: `chart-1`..`chart-5` (5-color categorical palette for Recharts)
- Sidebar-specific: `sidebar`, `sidebar-foreground`, `sidebar-primary`/`-foreground`, `sidebar-accent`/`-foreground`, `sidebar-border`, `sidebar-ring` (a fully separate token set from the main `background`/`card`/etc., allowing the sidebar to have distinct theming from page content — though `AppShell.tsx` doesn't actually use these `sidebar-*` classes; it uses `bg-card`/`border-border` for the `<aside>`, so this token set currently sits unused in the shell).

**Light mode** (`:root`, `styles.css:71-111`): background is a very light near-white with a slight cyan/teal tint (`oklch(0.985 0.004 200)`), foreground near-black with blue tint (`oklch(0.18 0.02 220)`). Primary is a **teal/green** (`oklch(0.55 0.13 174)`, hue 174° ≈ teal) — matches the "PadelCoach" brand's teal accent visible in `AppShell.tsx`'s "P" badge and active-nav-item styling. `--radius: 0.625rem` set here (the only place the base radius is defined).

**Dark mode** (`.dark`, `styles.css:113-152`): fuller color inversion — background near-black blue-gray (`oklch(0.129 0.042 264.695)`), and notably **primary shifts to a near-white gray** (`oklch(0.929 0.013 255.508)`) rather than staying teal — i.e. in dark mode the "primary" role is repurposed to a light neutral (common shadcn pattern for dark-mode primary buttons), while the sidebar/chart tokens shift to a cooler blue-purple palette (`chart-1` becomes `oklch(0.488 0.243 264.376)`, a blue, vs. light mode's teal `chart-1`). Every token defined in `:root` has a `.dark` counterpart except `--radius` (radius doesn't change between themes, as expected).

**Base layer** (`styles.css:154-163`): global reset applying `border-color: var(--color-border)` to `*` (every element gets the theme border color by default) and `background-color`/`color` on `body` from `--color-background`/`--color-foreground`.

**No custom utility classes** beyond the token/theme system — no bespoke `@utility` or `@layer components` blocks; styling is done entirely via Tailwind utility classes in components (confirmed by `AppShell.tsx`'s heavy inline `className` usage) plus the `cn()` helper (`clsx`+`tailwind-merge`) for conditional/merged classes.

---

## Files read in full
- `src/lib/presences-data.ts` (107 lines)
- `src/lib/classes-data.ts` (227 lines)
- `src/components/AppShell.tsx` (137 lines)
- `src/routes/__root.tsx` (129 lines)
- `src/router.tsx` (16 lines)
- `src/routeTree.gen.ts` (69 lines)
- `src/start.ts` (29 lines)
- `src/server.ts` (61 lines)
- `src/styles.css` (163 lines)
- `package.json` (90 lines)
- `vite.config.ts` (15 lines)
- `components.json` (22 lines)
- `AGENTS.md` (10 lines)
- `README.md` (29 lines)
- `.lovable/project.json` (5 lines)

Also confirmed via `grep`/`ls` (not full-read, out of assigned scope): no `localStorage`/`sessionStorage`/`createServerFn`/domain `fetch(` calls anywhere in `src/`; `src/routes/` contains only `__root.tsx`, `index.tsx`, and a routes-level `README.md`; `src/lib/` additionally contains `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, `utils.ts` (the `cn()` helper), none of which were in scope for this report.
