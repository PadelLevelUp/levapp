# Mobile parity plan — calendar, settings, i18n

Three parallel workstreams on `feature/levapp-redesign`, in the worktree at
`~/levelup-redesign-wt/frontend`. The web half of this redesign is done, QA'd
and green; `apps/mobile` is a separate React Native codebase that shares none
of those screens.

## Why the boundaries matter

These three streams overlap badly if left alone. The i18n retrofit touches ~46
files across the whole app — including the calendar and settings trees the
other two are rebuilding. So ownership is explicit and enforced:

| Stream | OWNS (may edit) | MUST NOT touch |
|---|---|---|
| Calendar | `app/(tabs)/calendar.tsx`, `src/features/calendar/**`, the shared calendar-status extraction, `src/locales/*/calendar.json` | settings trees, other locale files |
| Settings | `app/(tabs)/settings.tsx`, `src/features/settings/**`, `src/locales/*/settings.json` | calendar trees, other locale files |
| i18n | every `.tsx` **outside** `src/features/calendar/**`, `src/features/settings/**`, `app/(tabs)/calendar.tsx`, `app/(tabs)/settings.tsx`; all locale files **except** `calendar.json` and `settings.json` | the two feature trees above |

Locale files are split by namespace precisely so three agents can add keys
without fighting over one file.

**Both feature streams must write new strings through `t()` from the start**,
adding keys to their own namespace. Otherwise the i18n stream has to come back
and redo their work.

## Shared state

- One worktree, one git branch. Agents do NOT commit — the orchestrator reviews
  and commits, so a broken stream cannot poison the branch.
- One simulator, one Metro. Only one app instance can run, so **device
  verification is serialised and done by the orchestrator**. Agents verify by
  typecheck, unit test, and reasoning.
- Backend: Flask on `:5001` against the `levelup_test` DB. It gets killed by any
  `playwright test` run — **do not run the web E2E suite.**

## Stream 1 — Calendar

Bring the RN calendar to parity with the web mobile view: a split of the week's
classes on top and the selected day's detail below.

The state logic already exists and is tested, in `apps/web/src/lib/
calendar-status.ts` (+ `.test.ts`, 18 tests). It is pure TypeScript with no DOM
dependency. **Lift it into a shared package** (`@levelup/config` or a new
`packages/calendar`) and have BOTH platforms import it. Do not copy it: the two
platforms already drifted once today — the "next class" gate was stricter on
mobile than desktop, so tapping the day the next class fell on showed nothing.
A shared module is the fix for that class of bug.

What the web mobile view does, to mirror:
- week strip of class chips, tinted with the coach's chosen colour, contrast
  computed via `contrastTextOn` rather than hardcoded white
- finished classes faded via `fadeColor` (theme-aware, blends toward the card)
- the next class: white body, 1px border in the class colour, text and fill bar
  in `readableInk` of that colour
- three-part fill bar: confirmed / awaiting / free, from `confirmedCount`
- level chip top-right
- selected day's detail list underneath

Note the "spots to fill" dashed treatment was **removed** at the user's request
— do not reintroduce it.

## Stream 2 — Settings

The web settings is a drill-in: a list of all sections first, then one section
at a time with a back control. Mobile currently has a flat screen with four
sections. Parity means BUILDING the missing sections in RN, not restyling.

Sections on web: Profile, Preferences (incl. Coach Levels, Evaluation
Categories), Calendar (Seasons), Notifications (auto-invite engine), Import
Data, Club, Account.

Two things the web learned the hard way and should not be rediscovered:
- Coach-only sections must be **role-gated in the nav AND at the pane**. A
  player reaching settings by URL was offered Club, Import and Seasons, and the
  Notifications pane rendered blank with three uncaught 403s.
- Fixed-px row grids pushed a delete button to x=408 in a 390 viewport —
  unreachable, with no scroll. Rows must stack on narrow screens.

Log out now lives in Settings (the More tab that held it is gone). Keep it.

## Stream 3 — i18n retrofit

27 of 73 `.tsx` files use `useTranslation`. The rest are hardcoded English, so
switching language changes `i18n.language` and almost nothing re-renders. The
switch itself works — it persists via `PATCH /auth/me` and calls
`changeLanguage`; the gap is purely that screens do not read from i18n.

Retrofit the remaining files to `t()`, adding keys to the shared root locale
tree at `src/locales/{en,pt}/*.json` — one source of truth for both platforms.
pt is the product's primary language; en is mobile's fallback.

## Standards for all three

Verify by measuring, not by asserting. Today's session produced several
"fixed" claims that were not: a string replacement that silently no-opped
because the target had changed and success was printed without asserting; a
CSS class that compiled to nothing; an audit that measured the wrong element.
If you claim something works, show the number or the render that proves it.

Report what you could NOT verify as clearly as what you could.
