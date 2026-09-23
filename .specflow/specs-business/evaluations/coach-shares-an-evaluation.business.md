---
id: evaluations.coach-shares-an-evaluation
status: draft
implemented_by:
  - ../../specs/evaluations/sharing.spec.md
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# Coach Shares An Evaluation

## Outcome

A coach shows a player part of an evaluation — on purpose, choosing exactly what to show, and
seeing what the player will see before sending it.

**Decided by the owner on 2026-09-22 (PAD-402).** Today a player sees no evaluation at all, so
this is a new disclosure; the owner answered Q2, Q3, Q5 and Q6 as the rules below say.

## Who This Is For

Coaches deciding what a player is ready to see; the player who receives it.

## User Journey

1. On an evaluation in a player's history, the coach chooses "Partilhar avaliação".
2. They tick the competencies to show (all ticked to start), choose how much of the trend to
   include — since the last evaluation, six months, a year, or none — and decide whether their
   private note travels. It does not, unless they say so.
3. They preview the exact card the player will get, and can go back and change it.
4. They share. The player gets a message from them in their conversation — in the app only,
   with no phone or browser notification.
5. The card stays as it was shared. If the coach corrects the evaluation the same day, they can
   update the share; the player is not messaged again.
6. The coach can stop sharing. The card disappears from the player's side and nobody is told.

## Business Rules

1. Nothing is visible to a player until a coach shares it; the default is closed and stays
   closed.
2. The private note travels only when the coach ticks it.
3. What the player sees is frozen at the moment of sharing.
4. A share shows the trend of every competency the coach chose, over the period they chose — or
   no trend where there is nothing to compare.
5. An evaluation cannot be shared with nothing in it.
6. Sharing sends one in-app message and no push notification; updating a share and un-sharing
   send none.
7. Deleting an evaluation also stops the player seeing it.
8. Evaluations recorded before sharing existed can be shared like any other.
9. Each coach shares only their own evaluations.

## Success Metrics

Not yet measured. Candidate: the share of recorded evaluations that get shared, and how soon.

## Out of Scope

Any automatic sharing. Anything a player can do to an evaluation.

## Notes

- Owner answers of 2026-09-22 (`open-questions.md` in the canvas's archive entry): Q2 — a player
  sees only what a coach shares, as a block on the student dashboard (web + iOS), invisible to
  older App Store builds; Q3 — one message in the conversation, no push; Q5 — older evaluations
  are shareable; Q6 — un-sharing is silent and deleting an evaluation un-shares it.
