# Open questions raised by the canvas

Raised to the product owner on 2026-09-08 during ingestion. Answers get recorded here
and carried into the specs.

1. **Relationship to exercises.** Is the board the *editor* for an exercise's diagram
   (replacing `CourtDiagramEditor` inside the exercise form), a standalone scratchpad on the
   Treino landing with "save as exercise", or both? The canvas shows no name/type/difficulty
   fields and no save action.
2. **Is Magnético persisted?** A free whiteboard with pen strokes suggests a live-coaching
   tool. Does a Magnético board get saved, exported, or is it throwaway?
3. **Sequences.** Passo/AUTO imply steps. Is an exercise one sequence of ball hits and
   movements? Does a step hold one ball trajectory plus any number of movements? Is
   playback time-based or one-step-per-tap?
4. **Existing diagrams.** ~Each exercise already stores a flat `diagram.elements` list
   (P1–P4, coach, cone, blocker, ball, arrow, movement). Migrate them (map P1/P2 → A1/A2,
   P3/P4 → B1/B2, coach → feeder, arrow → ball path, movement → movement) or keep
   rendering them read-only as "legacy"?
5. **Player count.** Situações de jogo shows a fixed 2v2. Exercícios de cesto has
   "Adicionar jogadores". Is 2v2 fixed, and can cesto have 1–4 players on one side only?
6. **Tap-to-move vs drag.** The hint says tap piece then tap destination. Should drag
   also work (today's editors are drag-based)? Both is the safe default.
7. **Blocker piece.** Today's editor has a blocker (wall/obstacle). It is absent from the
   canvas. Drop it?
8. **Pen on iOS.** Freehand strokes need path capture on both platforms; the mobile editor
   currently has no freehand mode. Confirm the pen is in scope for iOS in the same ticket.
9. **Ticket.** No Linear ticket exists for this work. Create one (branch `feature/pad-<id>`)?
10. **Scope split.** One ticket or a wave (board shell + restyle → game situations →
    basket drills → magnético/pen → playback)?

## Answers (product owner, 2026-09-08)

1. **Board role: exercise editor only.** The board replaces `CourtDiagramEditor` inside the
   exercise create/edit flow. The Treino landing keeps a lighter entry with the two
   header buttons (Exercícios, Grupos); it does not host a live board.
2. Magnético: with the board living only inside the exercise editor, a Magnético board is
   simply an exercise whose diagram is in free-board mode (pen strokes + loose pieces) and is
   persisted with the exercise like any other diagram. No standalone, unsaved whiteboard in v1.
3. **Playback: full step sequences.** An exercise diagram becomes an ordered list of
   steps; Passo advances one, AUTO animates ball and players through all of them.
4. **Legacy diagrams: migrate on read.** P1/P2 → A1/A2, P3/P4 → B1/B2, coach → feeder,
   arrow → ball path, movement → movement; blockers dropped. Old JSON is upgraded when
   loaded and saved in the new shape on the next edit.
5. Cesto allows one to four players on one side (default accepted).
6. Drag and tap-to-move both work (default accepted).
7. Blocker piece dropped (default accepted).
8. Pen ships on iOS in the same ticket as web (default accepted).
9. A Linear ticket per wave item is created by the implementer (default accepted).
10. **Scope split: wave of tickets** — (1) board shell + court restyle + Situações de jogo,
    (2) Exercícios de cesto + feeder, (3) Magnético pen, (4) playback. Each ships web + iOS.
