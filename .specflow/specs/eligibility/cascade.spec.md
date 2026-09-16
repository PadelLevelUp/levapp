---
id: eligibility.cascade
status: implementing
depends_on: [eligibility.rules, classes.instances, classes.edit, classes.recurrence]
implements: ../../specs-business/eligibility/coach-sets-the-eligibility-bar.business.md
governed_by: []
---

# eligibility.cascade


### Intent
The standard eligibility is a default that a coach can adapt for a **recurring group of classes** or
for **one single class**. The most specific definition wins.

### Entities
- **Lesson** (`lessons`) gains **`eligibility_rules`** (JSON, nullable) — the bar for this recurring
  group / master event.
- **LessonInstance** (`lesson_instances`) gains **`eligibility_rules`** (JSON, nullable) — the bar
  for this single occurrence.

### Rules
1. **Resolution order, most specific first:** instance → parent lesson → coach standard. The first
   tier whose `eligibility_rules` is **not `NULL`** wins outright; tiers are **not merged**. A coach
   overriding a class replaces the bar, they do not add to it.
2. An explicit empty array `[]` at any tier is a **deliberate override meaning "everyone"** and wins
   over the tier below it. This is the only way to open a single class inside an otherwise
   restricted series, so `[]` and `NULL` must be stored and read as distinct values at the lesson
   and instance tiers.
3. **One resolver, no ad-hoc fallbacks.** Resolution lives in a single function
   (`effective_eligibility(instance_or_occurrence, coach)`), mirroring how `effective_level_id`
   already resolves instance → lesson. Every consumer — invitations, waiting list, student calendar,
   join requests, manual-add warning — calls it. Re-implementing the fallback at a call site is how
   PAD-86 happened.
4. **A non-materialized recurrence occurrence resolves at the lesson tier**, because no instance row
   exists to carry an override (`classes.instances` rule 1). Eligibility is therefore answerable for
   virtual occurrences without materializing them.
5. **Editing eligibility uses the existing scope dispatch** (`classes.edit`): `scope: "single"`
   writes the instance tier; `scope: "future"` writes the lesson tier.
6. **`scope: "future"` forks the series**, exactly as it already does for every other field: editing
   from a mid-series date splits the master lesson, and the eligibility change applies to the new
   master from that date forward. Occurrences before the split keep the old bar. The UI must not
   promise "this and future classes" any more strongly than the existing edit flow does.
7. The class-detail view shows which tier the active bar came from (standard / this series / this
   class). `LessonInstance.overridden_fields` is **not** a foundation for this — it is serialized out
   but never written by any service — so tier provenance is derived from which tier resolved.
8. **(PAD-129) Wire contract.** The class-detail payload carries `eligibilityRules` (the value stored
   at the tier the payload addresses: the instance's own for a materialised class, the lesson's for
   a virtual occurrence — `null` when that tier has no override), `effectiveEligibilityRules` (what
   rule 1 resolved) and `eligibilitySource` (`"instance" | "lesson" | "coach"`). A class edit sends
   `updates.eligibilityRules`: absent = untouched, `null` = clear this tier, `[]` = everyone, a list
   = that bar; `scope` picks the tier per rule 5. `effective_eligibility()` keeps its signature —
   every consumer (invitations, waiting list, manual add, PAD-130/131 later) is unchanged.
9. **(PAD-129) Both shells edit the bar in the class sheet's edit mode** with the same
   `EligibilitySection` the settings page uses, behind a three-way choice — *standard bar* (clear
   this tier), *everyone* (`[]`), *custom* (a list) — and show the provenance label in view mode.
   The scope dialog that already exists for every other field decides series vs class.

### Acceptance Criteria

#### Most specific tier wins
- **Given** a coach standard of `[{level, same_as_class}]`
- **And** a recurring lesson overriding it with `[{level, within_n_of_class, value: 1}]`
- **And** one instance of that lesson overriding it with `[{level, equal_or_above_class}]`
- **When** eligibility is resolved for that instance
- **Then** `equal_or_above_class` is applied, and the lesson and coach rules are ignored entirely

#### Tiers do not merge
- **Given** a coach standard of `[{unjustified_absences, less_than_or_equal, 2}]`
- **And** a lesson override of `[{level, same_as_class}]`
- **When** eligibility is resolved for an occurrence of that lesson
- **Then** only the level rule applies — a student with 5 unjustified absences at the right level is
  eligible

#### An empty override opens one class inside a restricted series
- **Given** a lesson whose eligibility is `[{level, same_as_class}]`
- **And** one instance whose eligibility is explicitly `[]`
- **When** eligibility is resolved for that instance
- **Then** every student on the coach's roster is eligible for it
- **And** the other instances of that lesson still apply the level rule

#### A virtual occurrence resolves at the lesson tier
- **Given** a recurring lesson with an eligibility override and an occurrence that has never been
  materialized
- **When** eligibility is resolved for that occurrence
- **Then** the lesson's rules apply
- **And** no LessonInstance row is created by the resolution

#### Editing future occurrences forks the series
- **Given** a recurring lesson with occurrences before and after 2026-09-01
- **When** the coach changes eligibility on the 2026-09-01 occurrence with `scope: "future"`
- **Then** the change applies from 2026-09-01 forward
- **And** occurrences before that date keep the previous bar

### Notes
- **[PAD-129, 2026-09-09]** Rules 8–9 record the wire contract and the shell UI. The resolver is the
  Phase-1 `effective_eligibility()` with the two tiers added *inside* it, as Phase 1 promised.
