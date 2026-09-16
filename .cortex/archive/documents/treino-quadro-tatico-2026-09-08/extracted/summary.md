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
