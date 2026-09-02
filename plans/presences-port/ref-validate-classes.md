# `ValidateClasses.tsx` — Exhaustive Functional Spec

File: `src/components/presences/ValidateClasses.tsx` (723 lines, no props, exported as `ValidateClasses`)
Data contract: `src/lib/classes-data.ts` (fully read)
Consumer: `src/routes/index.tsx` (the "Presences" dashboard route)

---

## 1. Purpose & user story

A padel coach runs private lessons and academy classes on a weekly recurring schedule. Before/after each class, students respond to some external invite/RSVP system with one of: confirmed attending, said absent, or no answer at all. The coach's job is to turn that raw RSVP data into a **final, authoritative attendance record** per student per class — Present / Absent‑justified / Absent‑unjustified — and mark the class "validated" (locked in) once every student has a determination.

`ValidateClasses` is a self-contained "inbox" widget for this workflow: a single button showing how many classes are awaiting validation, which opens a dialog where the coach can browse by week, see classes bucketed into "needs your input" vs "ready to confirm," bulk-validate the easy ones, drill into any single class to resolve stragglers student-by-student, add a walk-in player who wasn't on the original roster, and undo/edit already-validated classes later.

It's rendered once, at the top of the Presences dashboard (`src/routes/index.tsx:63`), above the stat cards, charts, and players table — positioned as the coach's daily "todo" action item, not a passive report.

## 2. Full component tree

```
ValidateClasses                         (exported, top-level state owner)
├── <button> trigger                    (lines 102-118)
└── <Dialog> (shadcn/radix)             (120-283)
    └── <DialogContent>
        ├── [if activeClass set] ClassValidation   (single-class detail/edit view)
        └── [else] list view:
            ├── DialogHeader (title + description)
            ├── week nav bar (ChevronLeft / label / ChevronRight)
            ├── bulk toolbar (Select all ready / Validate selected / Clear)
            ├── notice banner (conditional)
            ├── WeekList                            (288-368)
            │   └── per readiness-group → per day-group → ClassCard[]   (382-530)
            │       └── per-student status-toggle row + inline add-player <select>
            └── "Validated this week" section (conditional)
                └── list of validated classes, each with Undo + Edit buttons

ClassValidation (534-686)               (rendered instead of list view when a class is open)
├── DialogHeader (Back button + time/name title, day/type/court description)
├── status banner (undecided count OR "ready" success banner)
├── per-student row with full-label status-toggle buttons
├── inline "Player joined last minute?" add-player <select>
└── footer: [Undo validation] [Back] [Validate class / Save changes]

StudentChip (703-723) + CHIP_STYLES/CHIP_LABEL (688-701)
  — DEAD CODE: defined but never referenced anywhere else in the file
    or imported elsewhere in the codebase (verified via grep). Leftover
    from an earlier chip-based summary UI that was replaced by the
    current per-row status-button UI.
```

## 3. Every interactive element

**Trigger button** (102-118)
- Full-width button, `ClipboardCheck` icon badge, headline `"{pending.length} classes to validate"`, subtext "Review and confirm attendance."
- `onClick` → `setOpen(true)`.
- `pending` = **all** classes across **all** mock weeks (-1/0/+1) not in `validated` (line 51) — not scoped to the currently-browsed `week`. The badge count can disagree with what's visible after navigating weeks.

**Week navigator** (174-182)
- `ChevronLeft` icon button → `setWeek(w => w - 1)`.
- Center label: `weekLabel(week)` (classes-data.ts:203-214) — computes real Monday–Sunday dates from `new Date()` + `offset*7` days; labels "This week"/"Last week"/"Next week"/`Week ±N`.
- `ChevronRight` icon button → `setWeek(w => w + 1)`.
- **Unbounded** — no min/max; navigating beyond -1/0/1 just shows WeekList's empty state since no mock classes exist there.

**Bulk toolbar** (184-201)
- "Select all ready to confirm" (outline, sm) → `setSelected(readyIds)`. `disabled={readyIds.length === 0}`. `readyIds` = ids in `weekClasses` where `summarize(c).ready` (line 65).
- "Validate selected (N)" (default, sm) → `bulkValidate()`. `disabled={selected.length === 0}`. Label live-shows `selected.length`.
- "Clear" (ghost, sm) — **only rendered** when `selected.length > 0` → `setSelected([])`.

**Notice banner** (203-208) — conditional on `notice !== null`; `AlertTriangle` icon + text; not dismissible by the user directly (cleared by dialog close, line 126, or superseded by the next `bulkValidate()` call).

**WeekList → ClassCard, per class row** (382-530)
- `Checkbox` (420-425), `aria-label="Select {className}"` → `onToggle` → toggles the class id in/out of `selected` (213-215).
- "Validate" button (435-437) → `onValidate` → `markValidated([c.id])`. `disabled={undecided > 0}` (any student in the class with no Status yet).
- "Open" outline button with `Pencil` icon (438-440) → `onOpen` → `setActiveId(c.id)` — switches the dialog to the `ClassValidation` detail view for this class.
- Per-student row (444-485): 3 small toggle buttons — **Present / Justified / Unjustified** (`SHORT_STATUS`, short labels) → `onClick` → `onMark(st.id, opt)` → bubbles to `setMarks` (218-223), overwriting any prior mark immediately, no confirmation. Active option indicated via `data-on={current === opt}` driving `STATUS_STYLES` (green/muted/red backgrounds). **No way to un-set back to "no answer"** once a status button is clicked — you can only switch between the three options.
- "Add player" ghost button, `UserPlus` icon (519-526) — **only shown when `adding === false`** → `setAdding(true)`, revealing the inline form.
  - Inline form (488-517, shown when `adding === true`): native `<select>` of `available` names (STUDENT_POOL minus current roster, by name match, line 404) → `setAddName`. "Add" outline button, `disabled={!addName}` (502-513) → calls `onAddStudent(addName)`, then resets `addName` and `adding`. "Cancel" ghost button (514-516) → `setAdding(false)` only (does not clear `addName`).

**"Validated this week" list rows** (250-277)
- "Undo" ghost button (263-270) → `unvalidate([c.id])` — moves the class back to the pending/needs-review pool.
- "Edit" outline button, `Pencil` icon (271-273) → `setActiveId(c.id)` — opens `ClassValidation` with `isValidated=true`.
- Section-level "Reset all" ghost button (246-248) → `resetAll()` — see §6 for its actual (global, not week-scoped) blast radius.

**ClassValidation detail view** (534-686)
- Back `ChevronLeft` icon button in the title (572-574) → `onBack` → `setActiveId(null)` (returns to list view; does **not** revert any marks already made — every click already committed to top-level state, so Back only closes the panel).
- Per-student row (595-638): 3 toggle buttons with the **full** labels (`STATUS_LABEL`: "Present" / "Absent – justified" / "Absent – unjustified") → `onChange(s.id, st)` → same `setMarks` path as ClassCard.
- Inline "Player joined last minute?" add-player row (640-667): native `<select>` of `available` names → `setAddName`; "Add to class" button, `disabled={!addName}` (656-666) → `onAddStudent(addName)` then clears `addName` only (no `adding` toggle exists in this view — the select is always visible).
- "Undo validation" ghost button (672-676) — **only rendered when `isValidated && onUnvalidate`** → `onUnvalidate` → `unvalidate([id])` then `setActiveId(null)`.
- "Back" outline button (677-679) → `onBack` → `setActiveId(null)`.
- Primary button (680-682) — label `"Save changes"` if `isValidated` else `"Validate class"`; `disabled={undecided > 0}` → `onValidate` → `markValidated([id])` then `setActiveId(null)`. Re-validating an already-validated class is idempotent (Set-based dedup in `markValidated`, line 68).

## 4. Modal/dialog inventory

Only **one** dialog exists (shadcn/radix `Dialog`, 120-283), reused for two mutually-exclusive views (list vs single-class detail) via conditional rendering on `activeClass`.

- **Trigger:** the top-level button (102-118).
- **Title/description (list view):** "Classes to validate" / "Browse by week and day. Classes where everyone answered can be confirmed in bulk."
- **Title/description (detail view):** `{time} · {className}` with a Back button embedded in the title row / `{dayName} · {type} · {court}`.
- **Close behavior:** `onOpenChange` (122-128) — on close (`v === false`), resets `activeId` to `null` and `notice` to `null`. So **reopening the dialog always lands on the list view**, never mid-edit, even if it was closed while a class detail was open. `week`, `validated`, `marks`, `selected`, `extras` all persist across close/reopen (in-memory only — lost on page refresh).
- **No explicit "Cancel" for the dialog itself** — it's closed via the radix overlay/escape/X (from `DialogContent`), not visible in this file's JSX (comes from the shared `Dialog` primitive).
- There is also a native `window.confirm("Reset all validations and start over?")` (77) gating `resetAll()` — a blocking browser-native confirm dialog, not a design-system modal. OK → wipes state; Cancel → no-op.
- No sheets, popovers, drawers, or tooltips are used anywhere in this file.

## 5. State machine

All state lives in the top-level `ValidateClasses` function (module: lines 39-46) plus small local UI state in `ClassCard` and `ClassValidation`.

| State | Type | Init | Written by | Read by |
|---|---|---|---|---|
| `open` | `boolean` | `false` | trigger button (104), `Dialog.onOpenChange` (122) | `Dialog open` prop |
| `week` | `number` | `0` | chevron buttons (175,179) | `weekClasses` memo, `weekLabel()` |
| `validated` | `string[]` | `[]` | `markValidated`, `unvalidate`, `resetAll` | `pending`, WeekList filtering, "Validated this week" section |
| `marks` | `Marks` (`Record<classId, Record<studentId, Status>>`) | `{}` | per-student status-toggle `onClick`/`onChange` handlers, `onAddStudent` (auto-sets "present"), `resetAll` | `statusOf()` in ClassCard & ClassValidation, `undecided` counts |
| `selected` | `string[]` | `[]` | Checkbox toggle (213-215), "Select all ready" (188), `bulkValidate`/`markValidated` (dedupe removal), "Clear" (197), `resetAll` | bulk toolbar, Checkbox checked state |
| `activeId` | `string \| null` | `null` | "Open"/"Edit" buttons → id, Back/Validate/Undo → `null`, dialog close → `null` | conditional render of list vs `ClassValidation` |
| `notice` | `string \| null` | `null` | `bulkValidate` (set or clear), dialog close → `null` | notice banner render |
| `extras` | `Record<classId, ClassStudent[]>` | `{}` | `onAddStudent` handlers (both list-view and detail-view paths), `resetAll` | `withExtras()` merged into `weekClasses`/`activeClass` |
| `weekClasses` | derived (`useMemo`, deps `[week, extras]`) | — | — | list view, `readyIds` |
| `readyIds` | derived (plain expression, recomputed every render) | — | — | "Select all ready" button |
| `pending` | derived (plain expression) | — | — | trigger button badge |
| `active`/`activeClass` | derived (plain expression, **not** memoized) | — | — | detail view render |
| `ClassCard.addName` | local `string` | `""` | its own `<select onChange>` | disables "Add" button, passed to `onAddStudent` |
| `ClassCard.adding` | local `boolean` | `false` | "Add player" button, "Cancel" button, "Add" success | toggles inline form visibility |
| `ClassValidation.addName` | local `string` | `""` | its own `<select onChange>` | disables "Add to class" button |

**Status enum & legal transitions:**
- `Response` (external/immutable per student, comes from mock data): `"confirmed" | "absent" | "none" | "added"`. Never mutated by this component except that adding a walk-in student creates a new `ClassStudent` with `response: "added"` (147, 229) — a student's `Response` is otherwise fixed for the life of the session.
- `Status` (coach's decision, mutable via `marks`): `"present" | "justified" | "unjustified" | null (unset)`.
  - `null` → any of the three, via clicking a status button, or automatically for `"added"`/`"confirmed"`/`"absent"` responses via `prefillStatus()` (classes-data.ts:189-194) *as a default read fallback*, not a state write — `marks` itself stays empty until the coach (or `onAddStudent`) explicitly writes to it.
  - Any status → any other status, freely, any number of times (no confirmation, no history/audit trail).
  - **No transition exists back to `null`** once a mark is written — the UI offers no "clear" action.
- Class-level status (derived, not a stored enum): "needs your input" (has ≥1 student with `Status === null`) vs "ready to confirm" (all students have a Status, whether via explicit mark or via prefill) vs "validated" (`validated.includes(id)`). Legal transitions:
  - needs-input → ready-to-confirm (coach resolves the last unanswered student)
  - ready-to-confirm → validated (Validate button, or bulk validate)
  - validated → needs-input/ready-to-confirm (Undo button) — re-enters the pending pool at whatever readiness its current marks imply.

## 6. Business rules (quoted with line numbers)

**Readiness = "everyone responded," not "coach has decided."**
```ts
// classes-data.ts:196-201
export function summarize(c: PadelClass) {
  const confirmed = c.students.filter((s) => s.response === "confirmed").length;
  const absent = c.students.filter((s) => s.response === "absent").length;
  const none = c.students.filter((s) => s.response === "none").length;
  return { total: c.students.length, confirmed, absent, none, ready: none === 0 };
}
```
A class is "ready" purely because no student left the RSVP blank — combined with `prefillStatus` auto-deriving a default Status for `confirmed`/`absent`/`added` responses, this means a class can show as "ready to confirm" and even pass validation with **zero explicit coach clicks**, as long as every student answered the external invite.

**Default status derivation:**
```ts
// classes-data.ts:189-194
export function prefillStatus(response: Response): Status | null {
  if (response === "confirmed") return "present";
  if (response === "absent") return "justified";
  if (response === "added") return "present";
  return null;
}
```
`confirmed` → Present, `absent` → Justified (i.e. every self-reported absence is assumed *justified* by default — the coach must actively downgrade to "Unjustified"), `added` → Present, `none` → forces manual decision.

**Validate is hard-gated on zero unanswered students**, at both entry points:
```ts
// ValidateClasses.tsx:435 (ClassCard)
<Button size="sm" onClick={onValidate} disabled={undecided > 0}>Validate</Button>
// ValidateClasses.tsx:680 (ClassValidation)
<Button onClick={onValidate} disabled={undecided > 0}>
  {isValidated ? "Save changes" : "Validate class"}
</Button>
```

**Bulk validate never silently force-approves an incomplete class:**
```ts
// ValidateClasses.tsx:85-98
function bulkValidate() {
  const chosen = weekClasses.filter((c) => selected.includes(c.id));
  const ready = chosen.filter((c) => summarize(c).ready);
  const needs = chosen.filter((c) => !summarize(c).ready);
  if (ready.length) markValidated(ready.map((c) => c.id));
  if (needs.length) {
    setNotice(
      `${needs.length} class${needs.length > 1 ? "es" : ""} skipped — they have students with no answer and must be reviewed one by one.`,
    );
    setSelected(needs.map((c) => c.id));
  } else {
    setNotice(null);
  }
}
```
Splits the selection; validates the ready subset; bounces the rest back into `selected` with an explanatory notice, forcing per-student manual review (via "Open") for anything with a blank RSVP.

**Walk-in players bypass the answer requirement — auto-marked Present:**
```ts
// ValidateClasses.tsx:141-152 (list view) — mirrored at 224-235 for WeekList prop threading
onAddStudent={(name) => {
  const id = `${activeClass.id}-extra-${name}`;
  setExtras((e) => {
    const list = e[activeClass.id] ?? [];
    if (list.some((s) => s.id === id)) return e;
    return { ...e, [activeClass.id]: [...list, { id, name, response: "added" }] };
  });
  setMarks((m) => ({
    ...m,
    [activeClass.id]: { ...(m[activeClass.id] ?? {}), [id]: "present" },
  }));
}}
```
Adding a player both inserts them into the roster (`extras`) **and** immediately writes `Status: "present"` into `marks` — the assumption modeled is that a coach only adds someone who is physically present.

**No downstream consequences modeled.** No credits, packages, cancellation windows, capacity limits, no-show penalties, or payment logic exist anywhere in this file — attendance is a pure tri-state classification with no side effects beyond the `validated`/`marks` bookkeeping.

**Undo is always available post-validation**, re-opening the same edit surface with `isValidated=true` (footer label/behavior change only — no separate "locked" read-only mode is ever presented).

**`resetAll` is mislabeled in scope:**
```ts
// ValidateClasses.tsx:76-83
const resetAll = () => {
  if (confirm("Reset all validations and start over?")) {
    setValidated([]);
    setSelected([]);
    setMarks({});
    setExtras({});
  }
};
```
Placed under the "Validated this week" header (246-248) implying a per-week reset, but it clears `validated`/`marks`/`extras` **globally across all weeks** (-1/0/+1) in the mock dataset — a scope mismatch worth deciding deliberately for the rebuild (either scope the reset to `weekClasses` ids, or relabel/relocate the control).

## 7. Data flow

- **100% synthetic, in-memory, client-only.** No `fetch`, no API client, no `localStorage`/`sessionStorage`, no server persistence of any kind. All coach edits (`validated`, `marks`, `selected`, `extras`) live only in React state and are lost on page reload.
- **Source data** (`src/lib/classes-data.ts`) is generated once at module load by deterministic helper functions, not randomized — same output every run:
  ```ts
  // classes-data.ts:97-118
  function roster(classId, total, none, absent, offset): ClassStudent[] {
    const out = [];
    for (let i = 0; i < total; i++) {
      let response;
      if (i < none) response = "none";
      else if (i < none + absent) response = "absent";
      else response = "confirmed";
      const poolIndex = (offset + i) % STUDENT_POOL.length;
      out.push({ id: `${classId}-s${i}`, name: STUDENT_POOL[poolIndex], response });
    }
    return out;
  }
  ```
  24 hardcoded classes (`classes-data.ts:145-187`) via `mk(...)` calls spanning weekOffsets -1, 0, +1; `offset` rotates the starting index into the 64-name `STUDENT_POOL` (mod 64) so different classes get visually distinct rosters without true randomness — keeps demo data stable across reloads.
- `weekLabel(offset)` (classes-data.ts:203-214) is the one place that touches the real system clock (`new Date()`), computing actual calendar Monday–Sunday date ranges for display; it does not affect which mock classes exist (those are fixed to -1/0/+1 by hardcoded `weekOffset`).
- **Mutations performed, all local `setState`:** attendance status per student (`marks`), validated/unvalidated class ids (`validated`), ad hoc roster additions (`extras`), UI selection/navigation state (`selected`, `week`, `activeId`, `open`, `notice`).
- A real backend would need, at minimum: an endpoint to list classes+roster+RSVP-responses for a given week; a mutation to set/update a student's attendance Status for a class; a mutation to add a walk-in student to a class roster; and a validate/unvalidate (finalize) mutation per class — none of which exist today.

## 8. Empty / loading / error states

- **Empty:** `WeekList` (308-314) — `"Nothing left to validate this week. Nice work."` in a dashed-border, centered block. This single empty state covers two different real situations identically: (a) every class this week is already validated, and (b) the browsed week has no mock classes at all (e.g., week offset -2 or +2) — the rebuild should probably distinguish these.
- **Loading:** none. All data is synchronous and available at module load; no async boundaries, no skeletons/spinners anywhere in this file.
- **Error:** none. No fallible network operations exist; every action is a synchronous local state update that cannot fail.
- **Toast/notification equivalent:** the inline `notice` banner (203-208) — not an auto-dismissing toast; it's a persistent inline warning inside the dialog, only cleared by closing the dialog or by the next `bulkValidate()` call recomputing/clearing it.
- **Blocking native dialog:** `resetAll` uses `window.confirm(...)` (77) rather than a design-system confirmation modal — flagged as prototype scaffolding to replace in production.

## 9. Filters, search, sort, pagination, date/week navigation

- **Week navigation:** prev/next chevron buttons, unbounded integer offset, live-computed calendar label (§3, §7). No jump-to-date/calendar-picker.
- **No search box, no filter by class type (Private/Academy), court, or coach anywhere in this file.**
- **No pagination** — the dialog scrolls (`max-h-[88vh] overflow-y-auto`, line 130) as the list grows.
- **Implicit filtering/bucketing:**
  1. WeekList only ever receives non-validated classes for the current week (filtered by the parent, line 211) — validated classes move to the separate "Validated this week" section.
  2. Within WeekList, classes are grouped into exactly two buckets — "Needs your input" then "Ready to confirm" (316-319) — always in that fixed order, each only rendered if non-empty (324).
  3. Within each bucket, further grouped by day (unique `dayIndex` values present, ascending, 337-338), with a day-name header per group.
  4. Within a day, classes sorted by `time` (string comparison on zero-padded "HH:MM", ascending, line 345).
  5. Within a class (`ClassCard`), students are sorted "undecided first" (decided students pushed to the bottom, lines 407-409) so the coach sees what needs attention first; `ClassValidation` instead sorts "no-answer response first" (558-561) — a different sort key producing a similar but not identical ordering (see §10 for the discrepancy).
- **Bulk selection** ("Select all ready to confirm" / per-row checkboxes / "Validate selected (N)" / "Clear") functions as a lightweight batch-action filter+apply combo rather than a true filter UI.

## 10. Non-obvious/clever details, and demo scaffolding to replace

- **Dead code:** `CHIP_STYLES`, `CHIP_LABEL`, `StudentChip` (688-723) — fully defined, styled, and typed but never rendered or imported anywhere (confirmed via repo-wide grep). Almost certainly a leftover chip-based summary UI from an earlier iteration, superseded by the current inline status-toggle-button rows. Safe to drop when rebuilding, or worth resurrecting if a compact read-only summary view is wanted elsewhere.
- **`data-on` attribute pattern:** status buttons use `data-on={current === opt}` (472, 624) paired with Tailwind arbitrary-variant classes like `"data-[on=true]:bg-success data-[on=true]:text-foreground"` (`STATUS_STYLES`, 370-374) instead of building conditional className strings — a clean way to drive active-state styling.
- **Two independent editing surfaces write the same state shape but disagree on presentation:** `ClassCard` (compact list-row editing, short status labels "Present/Justified/Unjustified", sorted decided-last) vs `ClassValidation` (full detail view, long status labels "Present/Absent – justified/Absent – unjustified", sorted by raw response "none"-first). Both ultimately call the same top-level `setMarks`, so data stays consistent regardless of entry point, but a coach could see the *same* students in a *different order* and with *different button text* depending on whether they clicked "Open" from the row or drilled in — worth a deliberate decision (unify or intentionally keep distinct) in the rebuild.
- **`withExtras` inconsistency:** memoized as part of `weekClasses`'s `useMemo` (55-62, deps `[week, extras]`) but recomputed unmemoized every render for `activeClass` (52-53) — harmless at this data scale but inconsistent style.
- **Trigger button count (`pending`) is global-across-weeks** while everything else in the dialog is week-scoped — a real source of confusion once more than 3 mock weeks' worth of unvalidated classes exist; likely wants to become either genuinely global-with-a-week-breakdown, or scoped to "this week" to match the rest of the UI.
- **`resetAll` scope mismatch** — see §6, last item.
- **No true "unmark" affordance** — once a student status button is clicked, there's no way back to "no answer/undecided" through the UI (only switching among the three decided states). If a coach mis-clicks, they must pick a different (still-decided) status rather than truly reverting.
- **This is a pure prototype/mock surface** — swap-out points for a real backend integration: `classes` array + `STUDENT_POOL` (classes-data.ts) → API-backed weekly roster/RSVP fetch; `marks`/`validated`/`extras` local state → server mutations with optimistic UI; `window.confirm` → design-system confirm dialog; `weekLabel`'s live-`Date()` computation → keep, but classes' membership in a given week should come from real calendar dates rather than a hardcoded `weekOffset` field.
