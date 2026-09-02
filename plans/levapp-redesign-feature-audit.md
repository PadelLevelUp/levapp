# LevApp redesign — what the plan proposes vs what the code already does

Audited 2026-08-07 against `feature/levapp-redesign` (off `main` @ `e97549a`).
Source: `.claude/skills/levapp-design-system/LevelUp Redesign Plan.dc.html`.

**Why this exists.** The redesign plan was written from screenshots, not from source —
the skill's own readme says so. Several proposals turn out to describe things the app
already has, and at least one proposes building an engine that already exists and is
richer than the proposal. The plan's *diagnoses* hold up well; several of its
*prescriptions* need rewriting now that the code is in view.

Verdicts: **IMPORT** (worth building) · **ALREADY BUILT** (plan is out of date) ·
**RESHAPE** (right diagnosis, wrong fix) · **SKIP**.

---

## 1. Dashboard — "Fila de ação" (direction 1b)

**Plan:** replace the six metric tiles with a queue of only things needing a decision,
each with the decision attached. The list can reach zero.

**Code:** the dashboard is **already a configurable block system**.
`components/dashboard/DashboardRenderer.tsx` switches over block types —
`messages_overview`, `kpi_grid`, `class_list`, `notification_activity`,
`pending_confirmations`, plus a recursive `grid`. There is a whole `EditorPage.tsx`
route for arranging them. `DashboardPage.tsx` is 66 lines because it just renders
whatever blocks are configured.

**But the blocks are composed server-side, data included.** `DashboardPage` calls
`getDashboard({from, to})` and renders whatever comes back — the backend builds the
block list *and* fills it. `padel_app/helpers/dashboard/coach.py` and `player.py` compose
**different block sets per role**, so there is already a role-aware dashboard.

**Verdict: RESHAPE — cheaper than the plan implies, but not free.**

The action queue does not replace anything. It is **one new block type**, `action_queue`,
in a system built to take new block types, rendered by a renderer that already switches
on type. Coaches keep their existing arrangement.

The honest cost, though: because composition is server-side, this is **frontend +
backend**, not "just add a block". You need the block's data shape in
`packages/types/src/domain.ts`, a composer in `dashboard/coach.py` that assembles the
queue items with their decisions attached, and a renderer case. That is still far less
than rebuilding the home screen, but it is not a pure frontend change — my first read
of this was too optimistic and I corrected it.

> **Open question for you:** should the action queue join the default coach composition
> in `dashboard/coach.py`, or be opt-in? Changing the default changes every coach's home
> screen at once, since the arrangement is built server-side rather than stored per user.

---

## 2. Messaging — "Automações primeiro" (direction 2b)

**Plan:** make the rules the screen — what gets sent, when, to whom, and what it
produced. Chat drops to a second tab.

**Code:** `components/settings/NotificationsEngineSection.tsx` already implements an
automation engine, and it is **richer than the plan proposes**: automatic vs
semi-automatic invitation mode, reminders, invitation groups, tiebreakers, and
restrictions.

**Verdict: RESHAPE.** The plan's diagnosis ("automation disguised as chat") is correct,
but the fix is not to build an engine — it is to **surface the engine that exists**.
Today it is buried in Settings, configured blind, and reports nothing back.

What is genuinely missing is the **results half**: the plan's `31 enviados · 22 aceites ·
9 sem resposta`. The rules run, but a coach cannot see what they produced. That is the
part worth importing, and it likely needs backend support to aggregate outcomes per rule.

**Do not rebuild the engine.** Give it a surface and a result count.

---

## 3. Calendar re-encoding

**Plan:** "a full class, an empty class and a finished class look identical."

**Code:** only half true, and the half that is true is worse than the plan says.
`CalendarEventCard.tsx` **already shows** `participantCount/maxPlayers`, and already
renders distinct `canceled` (strikethrough + icon) and `completed` states.

The real problem is **colour**: `event.color` is a hex the coach picks from an 8-swatch
palette and it is stored per class. Colour therefore carries *no* status meaning — it is
decoration chosen at creation time. You cannot scan a week for holes, because a full
class and an empty one can be the same colour by coincidence.

**Verdict: IMPORT, in the smallest possible form.** Not "re-encode the calendar" —
add a **fill indicator** that reads at a glance (the plan's mobile "fill dot per class"
is the right primitive), while leaving the coach's chosen colour as identity. Occupancy
text already exists; it just does not read at week-scale.

Two sub-decisions:

- **The 8 swatches are raw Tailwind defaults** (`#0ea5e9`, `#22c55e`, `#ef4444`…) that
  clash with the new palette. Repainting them to LevApp equivalents is pure style.
  Existing classes keep their stored hex until edited — so the week will look mixed for
  a while either way.
- Does colour stay coach-chosen at all? If status should drive colour, the swatch picker
  has to go, and that is a real product change with data implications.

---

## 4. Treino — "a nav item with no evident home"

**Plan:** "Currently a nav item with no evident home. Proposal: a library of exercises
and session plans, tagged by level, that attaches to a class in one tap."

**Code:** **already built.** `pages/TrainingPage.tsx` routes to `/training/exercises` and
`/training/groups`; `components/training/` holds `ExerciseCard`, `ExerciseFormSheet`,
`ExerciseGroupFolder`, `ExerciseGroupFormSheet` and a `CourtDiagramEditor`. There is an
`exercise-crud` E2E spec. Planned exercises attach to class instances.

**Verdict: ALREADY BUILT — the plan is simply out of date here.**

The only piece of the proposal not present is "appears in the players' weekly summary",
which belongs to the player-facing app (§6).

---

## 5. Player profile restructure

**Plan:** one header (name, level, hand, status) then two tabs, Progresso and Histórico.
Destructive actions into a menu. The no-account invite becomes a share button, not a
dashed amber panel.

**Code:** matches the plan's description — `PlayerDetailPage.tsx` has **no tabs**, and
`components/players/detail/` is a flat stack of `PlayerHeader`, `PlayerInfoCard`,
`PlayerEvaluations`, `PlayerStrengthsWeaknesses`, `AddEvaluationSheet`,
`AddToClassesDialog`.

**Verdict: IMPORT.** Pure rearrangement of components that already exist and already
have their data — no new endpoints. This is the highest ratio of visible improvement to
risk on the list.

Caveat: it *is* a layout change, so it sits outside a strict FASE 1 repaint, and it will
move E2E locators. Memory records that `PlayerDetailPage` has two "Edit" buttons that
tests disambiguate positionally — tabs will break those specs and they will need
rewriting, not just re-selecting.

---

## 6. Player-facing app

**Plan:** three-tab shell — as minhas aulas / o meu progresso / mensagens.

**Code:** more exists than the plan assumes, on both platforms.

- **Mobile already switches shell by role.** `apps/mobile/app/(tabs)/_layout.tsx` reads
  `isCoach = user?.roles?.includes("coach")` and toggles tab visibility with
  `href: isCoach ? undefined : null`. Players already get a different tab set from
  coaches — the mechanism the plan asks for is in place.
- **The backend already composes a player dashboard.**
  `padel_app/helpers/dashboard/player.py` builds its own blocks (`kpi_grid`,
  `class_list`, `grid`) distinct from `coach.py`.

**Verdict: RESHAPE, not build-from-scratch.** The plan's "as minhas aulas / o meu
progresso / mensagens" is a *relabelling and filling-in* of a role-aware shell that
already exists, not new infrastructure. "O meu progresso" is the genuinely missing
surface — player-side evaluations over time.

Still the largest item, and it wants its own audit pass before costing. But it is not
greenfield, and the earlier draft of this document was wrong to imply it was.

---

## 7. Jogadores card fields

**Plan:** drop email — "the least useful field on it" — for level, hand, attendance over
the last 8 classes, and no-account status. New sort axes: sem conta, faltas recentes,
sem aula esta semana.

**Code:** cards currently show avatar, name, **email**, level chip and playing-side chip.
Sorting is name/level only. So the plan's read is accurate.

**Verdict: SPLIT.**
- Dropping email and showing level/hand/no-account: **IMPORT**, cheap, all data present.
- Attendance over last 8 classes, and the three new sort axes: **needs backend** —
  these are aggregates the list endpoint does not return. Cost this separately.

---

## 8. Settings save-on-change

**Plan:** kill the floating "Guardar alterações", save on change.

**Verdict: SKIP for now.** Smallest item, pure behaviour change, and autosave without a
confirmation affordance is a regression risk on a settings screen that drives an
automation engine. Revisit deliberately, not as a side effect of a redesign.

---

## Suggested order

| | Item | Verdict | Backend? |
|---|---|---|---|
| 1 | Calendar fill indicator + repaint swatches | IMPORT (small) | No |
| 2 | Player profile → header + tabs | IMPORT | No |
| 3 | Jogadores card fields (drop email, add hand/no-account) | IMPORT | No |
| 4 | `action_queue` dashboard block | RESHAPE | **Yes** — composed in `dashboard/coach.py` |
| 5 | Automation results surface (`31 enviados · 22 aceites`) | RESHAPE | **Yes** |
| 6 | Jogadores attendance + new sort axes | IMPORT | **Yes** |
| 7 | Player-facing shell — fill in a role split that exists | RESHAPE | **Yes** |
| — | Treino library | ALREADY BUILT | — |
| — | Settings autosave | SKIP | — |

**1–3 need no backend and no new concepts** — they rearrange components that already
have their data. That is the natural next batch after the repaint.

4–7 all need backend work. 4 is much cheaper than "rebuild the dashboard" but is not the
pure frontend change it first appeared to be.

## What the audit changed about the plan

Three proposals do not survive contact with the code:

1. **Treino is already built** — the plan calls it "a nav item with no evident home".
2. **The automation engine already exists**, and is richer than the plan's 2b proposal.
   What is missing is the *results*, not the rules.
3. **The dashboard is already block-based and role-aware**, so the action queue is an
   addition rather than a replacement.

The plan's *diagnoses* hold up almost everywhere. Its *prescriptions* were written
without the code in view, and several prescribe building what exists.
