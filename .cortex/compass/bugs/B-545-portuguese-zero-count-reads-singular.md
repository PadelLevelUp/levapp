---
id: B-545
title: "A count of zero read in the singular in Portuguese ('0 aula', '0 jogador'): i18next's 'pt' plural rules are Brazilian (0 = one), the app's Portuguese is European"
type: incomplete-rule
severity: low
status: resolved
resolved: 2026-10-11T17:10:00Z
affects:
  - .specflow/specs/settings/language.spec.md
  - frontend/src/locales/pt
proposed_fix: "Every pt `_one`/`_other` pair gains a `_zero` form (the plural), which i18next prefers for a count of 0; a guard test fails any new pt plural pair without one."
opened: 2026-10-11T16:50:00Z
---

# B-545: a zero count read in the singular in Portuguese

> Ledger id **unconfirmed** (wave-14 Session C range; index line after B-544).

**Source:** PAD-580 calendar QA (staging 12fc5c8da), filed as PAD-629: an empty day reads
"domingo, 11 outubro — 0 aula".

**Evidence (Phase 1):** with the real i18next 26.3.2 and `src/locales/pt/calendar.json`,
`t("calendar.mobile.classCount", { count })` gives "0 aula", "1 aula", "2 aulas".
`new Intl.PluralRules("pt").select(0)` is `"one"` (Brazilian rules); `"pt-PT"` gives `"other"`.
51 `_one`/`_other` pairs in 13 pt files have no `_zero` form, so every one of them reads singular
at zero ("0 jogador", "0 exercício", …). Guard test `apps/web/src/test/pt-plural-zero.test.ts` red.

**Root cause (tree):** `settings.language` rule 3 says the frontend uses i18next; no rule says how
plurals resolve, and the language code "pt" silently picks Brazilian rules. First NO at the rule
node → **Type 2, incomplete rule**.

### Change Plan
`settings.language` gains rule 9: European Portuguese plurals — a count of zero reads in the plural;
every pt plural pair carries a `_zero` form (i18next prefers `_zero` for count 0 in any language),
enforced by a guard over the locale files. Changing the language code to "pt-PT" was rejected: the
stored `users.language` value, the fallback and every `language === "pt"` check would move with it.
Then: sweep the 51 pairs (`_zero` = the `_other` text), guard test, criterion.

### Resolution

- Spec changes: `settings/language.spec.md` rule 9 + criterion "A count of zero reads in the plural
  in Portuguese".
- Tests: `apps/web/src/test/pt-plural-zero.test.ts` — guard over the pt locale files and the real
  i18next rendering "0 aulas / 1 aula / 2 aulas"; both red before the sweep.
- Code (locales only): 51 `_zero` keys in 13 pt files (the `_other` text) and the same 51 keys in
  en (the en `_other` text — no change to English output; the mobile bundle test requires equal key
  sets in en and pt).
- Resolved: 2026-10-11 (PAD-629; ledger id unconfirmed)
