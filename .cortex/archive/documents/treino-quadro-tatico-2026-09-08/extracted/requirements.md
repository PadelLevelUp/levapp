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
