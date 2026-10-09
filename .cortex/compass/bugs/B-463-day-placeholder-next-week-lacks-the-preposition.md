---
id: B-463
title: "{day} for a class next week read \"a próxima quarta-feira\"; the owner wants \"na próxima quarta-feira\""
type: wrong-rule
severity: low
status: triaged
affects:
  - .specflow/specs/notifications/message-templates.spec.md
  - backend/padel_app/services/notification_service.py
  - frontend/src/locales/pt/settings.json
proposed_fix: "The next-week form of {day} carries the preposition in Portuguese (na próxima / no próximo); the help steers coaches to sentences the field fits (\"A aula é {day} às {time}\"); en stays \"next Wednesday\"."
opened: 2026-10-09T21:05:00Z
---

# B-463: "a próxima quarta-feira" should be "na próxima quarta-feira"

> Ledger id **unconfirmed** (wave-13 range; B-461/B-462 are on sibling branches, so this index
> line sits after B-383 here).

**Source:** PAD-561 (owner, 2026-10-09), follow-up of PAD-549.

**What happens:** `format_relative_day` renders a class in the following week as
"a próxima segunda-feira" / "o próximo domingo" (rule 18's table), by the PAD-549 decision that
no preposition lives inside `{day}` so that "para {day}" reads "para a próxima segunda-feira".

**What should happen (owner decision):** "na próxima segunda-feira" / "no próximo domingo". The
owner knows "Abriu uma vaga para {day}" then reads "para na próxima…" and chose "na próxima"
anyway; the help shows sentence shapes the field fits ("A aula é {day} às {time}"). "hoje",
"amanhã", "depois de amanhã", "esta sexta-feira / este sábado" and "dia 23/10" are unchanged;
English stays "next Wednesday".

**Evidence (Phase 1):** `test_pad549_smart_day.py::test_the_day_reads_like_a_person_would`
asserts the current "a próxima" strings and passes on 4757c13d9: the code does what rule 18
says, and rule 18 is what the owner reversed. Type 3, wrong rule.

**Affected specs:** `notifications.message-templates` rule 18 (the "no preposition inside"
clause and the next-week row), its criterion, and rule 19's help text (the `day` field
description gains the sentence examples). Business spec unchanged.

### Change Plan
- Rule 18: the next-week form carries "na/no"; the other forms do not; the help steers the
  sentence shape. Criterion updated. "esta/este" stays as is (consistent: "A aula é esta
  sexta-feira" reads naturally; "nesta" would not improve it) — recorded as the default sent to
  the coordinator.
- `format_relative_day`: the two strings and the docstring.
- `settings.json` pt/en `templates.help.fields.day`: the examples and a sentence that fits.
- Tests: `test_pad549_smart_day.py` red first (three rows and the Friday case), plus one
  assertion that the help copy names a fitting sentence.

### Resolution

(filled in when the PR lands)
