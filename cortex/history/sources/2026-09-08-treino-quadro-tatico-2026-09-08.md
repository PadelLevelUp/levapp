---
about: treino-quadro-tatico-2026-09-08
permanence: stable
verified: "2026-09-08 (observed)"
origin:
  - migrated:archive/documents/treino-quadro-tatico-2026-09-08@ef7a5f3
  - "external:Claude Design canvas handed over by the product owner on 2026-09-08 for the redesigned Treino page — a three-mode tacti…"
aliases:
  - archive.treino-quadro-tatico-2026-09-08
captured: "2026-09-08"
---

## summary

# Treino — Quadro Tático (design canvas, 2026-09-08)

**Source:** `source.dc.html` (Claude Design artboard, 47 KB, desktop + mobile variants
behind a device toggle). **Kind:** design-canvas. **Language:** pt-PT, informal *tu*.

## What the canvas shows

The **Treino** page is redesigned around a single dark **tactical board panel** ("LEV APP ·
Quadro") instead of today's two navigation cards. The board has **three modes** as tabs,
each with its own toolbar, and a portrait padel court underneath. The existing exercise
library and exercise groups become two secondary buttons in the board header
("Exercícios", "Grupos de exercícios" / "Grupos" on mobile).

| Mode | Tab subtitle | Toolbar | Court pieces shown |
|---|---|---|---|
| **Magnético** | "Quadro livre" (free board) | Caneta (default active), Selecionar, Cone, Bola, Jogador; 5 colour swatches (white, green, blue — selected, red, amber); undo; ▶ AUTO | empty court |
| **Situações de jogo** | "Tática · uma bola" (tactics, one ball) | Selecionar, Bola, Movimentação, Cone; undo; Passo; ▶ AUTO; a per-tool hint line | fixed 2v2: A1, A2 (blue) top half, B1, B2 (red) bottom half; one ball trajectory (blue line, square waypoints, amber ball) with a midpoint handle that toggles **plana / lob** (lob renders as a curve) |
| **Exercícios de cesto** | "Alimentação" (basket feeding) | Selecionar, Bola, Mover, Jogador, Alimentador (default active); "Adicionar jogadores" button; undo; Passo; ▶ AUTO | A1, A2 (blue) top half, an amber square **ALIMENTADOR** (feeder) at mid-court, a white ball |

Below the court a **legend** explains the encoding: solid arrow = Bola, dashed line =
Movimentação, blue dot = Equipa A, red dot = Equipa B.

## Court geometry

Portrait, 340×600 px on desktop (`min(280px, 72vw)` at the same 340:600 aspect on
mobile). Navy-800 frame with "EQUIPA A" (top) / "EQUIPA B" (bottom) captions; blue
gradient playing surface (#0E6BD6 → #0B5FC2) with a white double-line **net at 50 %**, a
**full-length centre line**, **service lines at 32 % and 68 %**, and an outer boundary
inset 2 %. Today's production court is green (#1a6b35), 240×480 units, service line at
167/480 ≈ 35 % — so this is a visual replacement, not the same drawing.

## Playback

Every mode carries a **▶ AUTO** primary button; the two exercise modes also carry a
**Passo** (step) secondary button. Together with the prototype note ("os três modos,
ferramentas e peças ainda não desenham nem animam") this implies **sequenced, animated
drills** — the ball and players move step by step — which today's single static
`CourtDiagram` cannot represent.

## Shell

Desktop: 248 px navy sidebar (Painel, Calendário, Jogadores, **Treino** active, Presenças,
Mensagens, Definições), white page header "Treino" with the coach avatar + name. Mobile:
390 px column, header "Treino" + avatar, fixed six-item bottom nav (Painel, Calendário,
Jogadores, Treino, Presenças, Mensagens — Definições is off the bar, matching decision
`2026-09-04-ios-tab-bar-and-theme`).

## Explicit non-goals stated in the canvas

"Protótipo visual — serve para validar o visual antes de ligar a interação": the canvas
validates look and information architecture only. No drawing, dragging or animation is
implemented in it; the only live control is the plana/lob toggle.

## open-questions

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

## requirements

# Requirements inferred from the canvas

Each item cites the region of `source.dc.html` it comes from (desktop lines; the mobile
variant, lines 270–449, mirrors the same content). "Inferred" marks behaviour the static
canvas only implies; those items are the open questions in `open-questions.md`.

## QT-001 — Treino landing is the board
Lines 77–92, 279–291. The Treino page opens straight onto the tactical board panel. The
exercise library and groups are reached from two header buttons inside the panel
("Exercícios", "Grupos de exercícios" / "Grupos"). Replaces `TrainingPage.tsx`'s two cards
and the mobile `training.tsx` tab layout.

## QT-002 — Three board modes as tabs
Lines 94–108, 293–303. Tabs: Magnético ("Quadro livre"), Situações de jogo ("Tática · uma
bola"), Exercícios de cesto ("Alimentação"). Active tab: blue-500 bottom border, 14 %
blue tint. The prototype opens on Situações de jogo.

## QT-003 — Magnético toolbar
Lines 110–131, 332–342. Tools: Caneta (pen, default), Selecionar, Cone, Bola, Jogador.
Colour swatches: white, green-600, blue-500 (selected, white ring), red-600, amber-600.
Undo icon. ▶ AUTO. *Inferred:* the pen is freehand drawing in the selected colour; the
swatch colours also apply to placed pieces (cone/ball/player).

## QT-004 — Situações de jogo toolbar and hints
Lines 133–167, 305–330. Tools as bordered cards (blue ring when active): Selecionar,
Bola, Movimentação, Cone. Right side: undo, Passo, ▶ AUTO. Hint copy per tool:
- Selecionar: "Toca numa peça para a selecionar (fica com um anel), depois toca no destino para a mover." — tap-to-select then tap-to-move, no drag required.
- Bola: "Desenha a trajetória da bola. Toca no ponto a meio da linha para alternar entre plana e lob." — ball path with a midpoint handle toggling flat/lob.
- Movimentação: "Toca no jogador e depois no destino — cria o percurso tracejado do movimento." — player movement path, dashed.

## QT-005 — Fixed 2v2 in Situações de jogo
Lines 209–221. Four players are pre-placed: A1, A2 (blue-400 disc, dark text) in the top
half; B1, B2 (red-600 disc, white text) in the bottom half. Team A vs Team B replaces
today's P1–P4 four-colour scheme and the separate coach piece.

## QT-006 — Ball trajectory with plana/lob toggle
Lines 222–228, 469–477, 542–544. The ball path is a blue-500 stroke from a square
waypoint (white, blue border) to another; the amber ball sits at the start. A round
handle at the path midpoint toggles `ballStyle` between "plana" (straight `L`) and "lob"
(quadratic `Q` curve bowed toward the side); the lob handle gets a thicker ring. This is
the one interaction the canvas actually implements.

## QT-007 — Exercícios de cesto toolbar and pieces
Lines 169–188, 231–245, 344–355, 389–402. Tools: Selecionar, Bola, Mover, Jogador,
Alimentador (default active). "Adicionar jogadores" button (mobile: "Jogadores"). Undo,
Passo, ▶ AUTO. Pieces: A1, A2 in the top half; an amber rounded-square feeder labelled
ALIMENTADOR at mid-court (46 %, 55 %); a white ball just above the net. *Inferred:* the
feeder is the coach with a basket feeding balls to the players; "Mover" is the movement
path tool renamed for this mode.

## QT-008 — Playback: Passo and ▶ AUTO
Lines 129, 158–159, 185–186. AUTO in all three modes; Passo in the two exercise modes.
*Inferred:* an exercise is an ordered sequence of steps (ball hit → player moves → next
hit); Passo advances one step, AUTO plays the sequence. Requires a sequence/step data
model, not the current flat element list.

## QT-009 — Undo
Lines 128, 157, 184, 325. A single undo icon per toolbar. Today's editors have only
"clear all".

## QT-010 — Court visual
Lines 191–207, 357–365. Portrait 340×600 frame, navy-800, EQUIPA A/B captions, blue
gradient surface, white double net at 50 %, full-length centre line, service lines at 32 %
and 68 %, 2 % outer boundary. Both platforms must render the same geometry because
diagrams are shared data.

## QT-011 — Legend
Lines 251–259, 407–414. Solid arrow = Bola, dashed = Movimentação, blue = Equipa A, red =
Equipa B. Mobile shows only the team legend.

## QT-012 — Desktop and mobile parity
The canvas ships both variants; per rule R-024 the iOS app ships the same board in the
same ticket. Mobile toolbars scroll horizontally; the court scales with the viewport.

## QT-013 — Shell unchanged
Lines 36–75, 422–447. Sidebar / bottom nav and page header match the shipped redesign;
no navigation change beyond Treino's own content.

<!-- 3.x fields of archive/documents/treino-quadro-tatico-2026-09-08, carried verbatim by cortex migrate -->
```yaml
kind: design-canvas
version: "2026-09-08"
status: active
source_filename: Treino - Quadro Tatico.dc.html
origin: "Claude Design canvas handed over by the product owner on 2026-09-08 for the redesigned Treino page — a three-mode tactical board (Magnético, Situações de jogo, Exercícios de cesto) in desktop and mobile variants, built on the LevApp design-system tokens. The canvas is a visual prototype only (\"ainda não desenha nem anima\"); interaction is implied by the toolbars, hint copy and the one live control (plana/lob toggle)."
```
