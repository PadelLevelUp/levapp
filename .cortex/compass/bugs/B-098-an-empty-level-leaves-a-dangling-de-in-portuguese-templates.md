---
id: B-098
title: "A class with no level renders \"aula de esta quarta-feira\": the empty {level} leaves its connector dangling"
type: wrong-rule
severity: medium
status: triaged
affects:
  - notifications.message-templates
  - backend/padel_app/services/notification_service.py
proposed_fix: "_format_template drops the genitive connector (de/da/do, of) that precedes an empty placeholder, so \"aula de {level} esta\" renders \"aula esta\" and \"aula de {level} de {weekday}\" renders \"aula de quarta-feira\"."
opened: 2026-09-16T17:35:00Z
---

# B-098 — An empty `{level}` leaves its connector dangling in every Portuguese template

**Source:** Session H's observation while verifying #257 (PAD-331/318), ticket PAD-346.
Reproduced by Session B on 2026-09-16 by rendering every default template with `level=""`.
Bug number self-assigned from Session B's reserved range B-096..B-100 (unconfirmed).

**What happens:** on `staging` today, `_format_template` already collapses the double space
(PAD-38, `cba0dc44a`), so the cosmetic half of the ticket is gone. What remains is the noun:
every Portuguese default puts `{level}` after the genitive "de", and with no level the "de"
dangles —

| template | renders |
| --- | --- |
| `reminder` | "tens a aula de esta quarta-feira às 10:00" |
| `reminder_followup` | "tens vaga para a aula de esta quarta-feira" |
| `invite` | "abriu uma vaga na aula de na próxima quarta-feira" |
| `waiting_list_placed` | "Abriu uma vaga na aula de na quarta-feira" |
| `class_cancelled` | "a tua aula de de quarta-feira às 10:00 foi cancelada" |

English defaults read "the class this Wednesday": correct already, because "the {level} class"
needs no connector.

**What should happen:** "tens a aula esta quarta-feira", "a tua aula de quarta-feira" — the
level phrase disappears whole, connector included.

**Root cause:** `notifications.message-templates` rule 7 says an empty `{level}` "renders an
empty string (no filler word), leaving surrounding template text grammatical". The second half
is the wrong claim: an empty string leaves Portuguese grammatical only when the placeholder is
not the object of a preposition, and in every pt default it is. The formatter did what the
rule said and the rule was wrong.

**Evidence that selected the type:** the rendered strings above, produced by the formatter the
rule governs, with the rule's own "empty string" behaviour in place.

**Affected specs:**
- Dev: `.specflow/specs/notifications/message-templates.spec.md` (rule 7 corrected, criterion
  "Weekday and level render in the coach locale with no artifacts" extended)
- Business: `.specflow/specs-business/notifications/*` — no drift; no business spec promises
  the wording

### Change Plan

**Spec to modify:** `.specflow/specs/notifications/message-templates.spec.md`
**Change type:** Correct rule 7.

**Then:**
1. `_format_template`: for a placeholder whose value is empty, drop a directly preceding
   genitive connector (`de`, `da`, `do`, `of`, case-insensitive) together with the placeholder,
   before the existing whitespace/punctuation tidy-up. A coach's own template keeps working the
   same way; a connector other than those is left alone (not guessable).
2. `test_pad346_empty_level_reads_whole.py`: every pt and en default rendered with `level=""`
   contains no "de esta", "de na", "de de", no double space and no raw token, plus the exact pt
   reminder text; and an end-to-end reminder for a level-less class through
   `send_class_reminders` in pt.

### Resolution

- Spec changes: `.specflow/specs/notifications/message-templates.spec.md`
- Tests added: `backend/padel_app/tests/test_pad346_empty_level_reads_whole.py`
- Code changes: `notification_service._format_template`
- Resolved: pending (PAD-346 PR)
