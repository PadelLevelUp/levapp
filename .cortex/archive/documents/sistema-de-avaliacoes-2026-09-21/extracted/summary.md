# Sistema de Avaliações (design canvas, 2026-09-21)

**Source:** `source.dc.html` (Claude Design canvas, 59 KB, 806 lines; markup L1–457, script
L458–804). **Kind:** design-canvas. **Language:** pt-PT, informal *tu*. **Scope:** the coach's
desktop web app only — no phone layout, no player-side screen, no English copy. All data is
in-memory mock state. Read in full; not rendered (its design-system bundle was not on disk).

## What the canvas proposes

1. **An evaluation is one record**: several competency ratings, one private note, a date, an
   optional class link and a sharing state — keyed by player, class-or-none and calendar day
   (AV-001, AV-002, AV-007, AV-008).
2. **Ratings are 1–5 stars, saved on tap**, for every competency; only what the coach rated is
   stored; evaluation stays optional and partial (AV-003–AV-006).
3. **Evaluating from the class**: a primary "Avaliações" action on the class detail opens a
   participant accordion — "Sem avaliação" / "N/M avaliadas" — to rate in place (AV-010–AV-015).
4. **A padel competency catalogue**: 17 built-in competencies in groups Geral, Técnica, Tática,
   three active by default, switched on and off without losing history, plus custom ones under
   "Personalizada" — "Gerir competências" (AV-020–AV-026).
5. **The player's evaluations drawer**: "Nova avaliação" outside a class; per-competency
   evolution as monthly averages with "Média mensal / semestral / anual" and a delta
   "↑ +1.5 desde Jan"; a history of dated cards (AV-030–AV-037).
6. **Sharing is explicit and selective**: "Partilhar avaliação" → choose competencies, an
   evolution period, and whether to include the note (off by default) → preview → "Partilhar";
   the card then reads "✓ Partilhada com o aluno em …" and what was shared is stored
   (AV-040–AV-043).
7. **"Frequência de avaliações"** in Definições: Nunca / Mensalmente (default) / A cada 2 aulas /
   A cada 4 aulas / Personalizado — a stored choice the canvas never acts on (AV-050).
8. A dark-mode switch in the shell (AV-060) — outside the evaluation system.

## What it declares out of scope

"Fora do âmbito": the views Painel, Treino and Mensagens, and the profile cards "Informação" and
"Pontos fortes e fracos". Inert chrome: the disabled profile actions and the class-detail
buttons other than "Avaliações" (AV-090).

## What it leaves open

The player's side of a shared evaluation; whether sharing notifies; what the reminder *is*; what
happens to existing scores on other scales; clearing a rating; editing, deleting or un-sharing;
phone layouts; English copy. See `open-questions.md` (7 owner decisions, 18 build defaults).

## Files

- `requirements.md` — AV-001…AV-090, each cited to canvas lines; section I lists edge states and
  mock defects found in the script.
- `screens.md` — every screen and state, navigation map, mock data.
- `tokens.md` — design-system components and semantic tokens used.
- `open-questions.md` — questions with recommended defaults.

The comparison with what ships is in the companion document
`../../sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md`.
