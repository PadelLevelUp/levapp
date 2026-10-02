---
id: B-255
title: "Evaluation categories: the manager offered a default's sub-categories under a legacy row of its name, and each one added became a stray category"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-02T13:33:17Z
updated: 2026-10-02T13:33:17Z
affects:
  - evaluations.competencies
  - frontend/packages/config/src/competency-manager.ts
proposed_fix: "Where a legacy row holds a default category's name, the manager does not offer that default's sub-categories (rule 15)."
opened: 2026-10-02T13:11:41Z
---

# B-255: sub-categories offered where they could not belong

**Source:** PAD-473 follow-up PAD-480 (a coach: "Bandeja" and "Serviço" exist attached to no category).

**What happens:** a coach who holds a LEGACY category named like a default ("Técnica") sees, in
"Definir categorias de avaliação", a "Técnica" heading with the catalogue sub-categories offered under
it (`categorySections`, the section with no head row). Adding one sends no parent, and rule 15
("Creating") then creates it as a category of its own, because the legacy row holds the default's
name and a legacy row can never be a parent (R-047). The entry leaves the heading it was picked from
and becomes a top-level "stray". Every pick makes another.

**Evidence:**
- Unit test, `packages/config/src/competency-manager.test.ts` ("B-255: …"): with a legacy " Técnica "
  held, the builder returned a `key-technique` section offering 8 sub-categories (red on staging
  e88f29a5e).
- Prod (read-only, run by the coordinator 2026-10-02 13:07–13:09 UTC): coach 2 holds legacy "Técnica",
  "Tactica", "Consistencia" (created 09-17) and top-level catalogue sub-level rows Bandeja (09-24) and
  Serviço (09-24), now inactive. These two predate PAD-431; the PAD-431 migration left them top-level
  because the legacy "Técnica" holds the name (its `lower(btrim())` match). The manager has since
  offered the remaining Técnica entries under that heading.

**Root cause (diagnostic tree):** `evaluations.competencies` rule 15 says what is offered under a held
or available default, and that a sub-level entry is created as a category when a legacy row holds the
default's name, but not what the manager offers in that case. Type 2, incomplete rule.

### Change Plan
- Spec: rule 15 "No new strays": where a legacy row holds a default's name, its sub-categories are not
  offered. The API path stays.
- Code: `categorySections` drops such a section (no head row, no available default); the shared test
  pins it. Both clients use the builder.

### Resolution (PAD-480)

- **Spec:** `evaluations.competencies` rule 15 gains "No new strays": where a legacy row holds a
  default category's name and the coach has no non-legacy row of it, the manager offers none of
  that default's sub-categories. The API path is unchanged.
- **Code:** `categorySections` (`packages/config/src/competency-manager.ts`) offers a default's
  sub-level entries only when the default is held or available. Both clients build their sections
  from it, so web and iOS from PAD-480 on no longer offer those entries.
- **What remains, on purpose:** the server path stays. `POST {catalogueKey}` for a sub-level entry
  with no `parentId`, while a legacy row holds the default's name, still creates the entry as a
  category (rule 15 "Creating"). iOS builds that predate PAD-480 still offer it: 1.2.0 (27) and
  1.2.1 (28, cut from 1cc9db7c5; the coordinator ruled 2026-10-02 that 28 does not go to the App
  Store). The move PR also stops new strays by hand: a catalogue sub-category cannot be sent to the
  top level, and a stray cannot become a parent.
- **Test:** the shared builder test that expected the offer ("a default the coach cannot be offered
  … still lists its sub-categories") encoded this bug. It is rewritten as "B-255: … offers none",
  with a legacy " Técnica " held.
- **Existing strays** (prod coach 2's Bandeja and Serviço) can now be moved under a category by hand
  (rule 15 "Moving", PAD-480). Converting the legacy row is the owner's open decision.
