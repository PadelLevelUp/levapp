---
id: training.tactical-board
status: implementing
depends_on: [training.exercises]
implements: ../../specs-business/training/coach-builds-exercise-library.business.md
governed_by: [R-015, R-024, R-025]
provenance:
  - derives_from: archive/documents/treino-quadro-tatico-2026-09-08/extracted/requirements.md
  - derives_from: archive/documents/treino-quadro-tatico-2026-09-08/extracted/open-questions.md
---

# training.tactical-board

### Intent
The redesigned court diagram editor ("Quadro Tático") that a coach uses inside exercise
create/edit, on web and iOS alike. It replaces `training.court-diagram`'s single static element
list with a mode-aware board — **Situações de jogo** (2v2 tactics, one ball), **Exercícios de
cesto** (basket feeding drills) and **Magnético** (free board with pen) — whose diagram is an
ordered sequence of steps that can be stepped through (Passo) or animated (AUTO).

Source of truth for the visual: archive document `treino-quadro-tatico-2026-09-08`
(`extracted/requirements.md`, items QT-001..QT-013). Product decisions from the ingestion
Q&A are in `extracted/open-questions.md` and repeated in the rules below.

### Entities
- **READS / WRITES:** Exercise.diagram (JSON) — no new tables, no new endpoints. The backend
  stores the JSON opaquely (`training_service.py` passes `data["diagram"]` through unchanged).
- **CREATES (JSON shape, not a table):** `CourtDiagramV2`

```ts
// packages/types/src/training.ts
type Team = "A" | "B";
type BoardMode = "game" | "basket" | "magnetic";      // Situações de jogo | Exercícios de cesto | Magnético
type Point = { x: number; y: number };                 // percent of the playing surface, 0..100 on both axes

type Piece =
  | { id: string; kind: "player"; team: Team; label: string; x: number; y: number }   // "A1".."B2"
  | { id: string; kind: "feeder"; x: number; y: number }                               // Alimentador (basket mode)
  | { id: string; kind: "cone";   x: number; y: number; color?: PieceColor }
  | { id: string; kind: "ball";   x: number; y: number; color?: PieceColor }           // loose ball (magnetic mode)
  | { id: string; kind: "stroke"; color: PieceColor; points: Point[] };                // pen (magnetic mode)

type PieceColor = "white" | "green" | "blue" | "red" | "amber";                        // the five swatches

type BallPath = { from: Point; to: Point; style: "flat" | "lob" };                      // plana | lob
type Movement = { pieceId: string; to: Point };                                        // dashed path for a player

type Step = { id: string; ball?: BallPath; movements: Movement[] };

interface CourtDiagramV2 {
  version: 2;
  mode: BoardMode;
  pieces: Piece[];       // the starting position
  steps: Step[];         // ordered; may be empty for a purely static board
}
```

The legacy shape `{ elements: CourtElement[] }` (no `version`) remains readable — see rule 12.

### Rules

**Board and modes**
1. The board lives inside exercise create/edit only (web `ExerciseFormSheet`, mobile
   `exercise-form.tsx`). The Treino landing keeps its two entry points (Exercícios, Grupos) and
   does not host a board. (Decision: open-questions #1.)
2. Three modes, shown as tabs with the canvas subtitles: Situações de jogo · "Tática · uma
   bola" (default for a new exercise), Exercícios de cesto · "Alimentação", Magnético · "Quadro
   livre". A mode that is not yet shipped is not rendered — no disabled tabs.
3. Switching mode on a board that already has pieces or steps asks for confirmation and then
   resets the board to that mode's starting position.
4. Every mode has an **undo** control that reverts the last mutation (piece placed or moved,
   path drawn, style toggled, step added). Undo depth ≥ 20 within one editing session.

**Court**
5. Portrait court, playing surface 340:600 aspect, rendered with the canvas geometry: net at
   50 %, full-length centre line, service lines at 32 % and 68 %, outer boundary inset 2 %,
   "EQUIPA A" above and "EQUIPA B" below. Colours are diagram content and use the design-system
   values directly (surface #0E6BD6→#0B5FC2, frame navy-800 #0D1B31, Team A blue-400 #4A9BFF,
   Team B red-600 #D3453B, ball path blue-500 #2F8AFF, ball/feeder amber-600 #D98324) rather
   than the shadcn status palette — the same exception `CourtDiagramEditor` already documents.
6. Web and iOS render the same diagram JSON pixel-equivalently: all coordinates are percent of
   the playing surface, and the court geometry constants live once, in
   `packages/config/src/court-diagram.ts`, consumed by both apps and by the exercise-card
   thumbnail.

**Situações de jogo (game mode)**
7. Starting position is a fixed 2v2: A1 (32 %, 26 %), A2 (62 %, 26 %), B1 (32 %, 70 %),
   B2 (62 %, 70 %). Players cannot be added or removed in this mode; they can be moved.
8. Tools: Selecionar, Bola, Movimentação, Cone. Selecionar supports **both** tap-to-select then
   tap-destination (the canvas hint) **and** drag. The active tool shows the canvas hint copy
   (pt-PT, informal *tu*) below the toolbar.
9. Bola draws the current step's ball path from a first tap/press to a second (or a drag).
   A round handle at the path midpoint toggles `style` between `flat` (straight line) and `lob`
   (quadratic curve bowed 12 % of the surface width to the right of travel, matching the canvas
   `M58,20 Q70,50 40,80`). One ball path per step ("uma bola").
10. Movimentação: tap a player then a destination → a dashed movement for that player in the
    current step. A player has at most one movement per step; drawing again replaces it.
11. Cone places a cone at the tapped point; selecting a cone and pressing delete/eraser removes it.

**Legacy diagrams**
12. A diagram without `version` is upgraded on read by `upgradeCourtDiagram()` in
    `packages/config/src/court-diagram.ts`, and saved back in v2 on the next edit:
    `player_1/2` → Team A `A1/A2`, `player_3/4` → Team B `B1/B2`, `coach` → `feeder`,
    `cone` → cone, `ball` → ball, `blocker` → dropped, each `arrow` → its own step's `BallPath`
    (`lob` when `|curve| ≥ 2`, else `flat`), each `movement` → a `Movement` for the nearest
    player within 12 % of its start point (dropped when no player is that close). Mode is
    `basket` when a coach was present, otherwise `game`. Legacy coordinates (280×520 viewBox,
    20-unit padding) map to percent as `x% = (x−20)/240·100`, `y% = (y−20)/480·100`.
13. The exercise-card thumbnail (web `ExerciseCard.tsx`, mobile exercises tab) renders v2 and
    legacy diagrams through the same shared renderer, showing the starting position and the
    first step's ball path.

**Exercícios de cesto (basket mode)** — wave 2
14. Starting position: A1 (30 %, 18 %), A2 (60 %, 18 %), one feeder at (46 %, 55 %). The
    "Adicionar jogadores" control adds A3/A4 (max four players, all Team A); a selected
    player can be removed down to one.
15. Tools: Selecionar, Bola, Mover, Jogador, Alimentador. Bola in this mode always starts at
    the feeder and ends where the coach taps ("Alimentação"). Mover is Movimentação renamed.
    Alimentador moves the feeder (exactly one feeder per diagram).

**Magnético (free board)** — wave 3
16. Tools: Caneta (default), Selecionar, Cone, Bola, Jogador, plus five colour swatches
    (white, green, blue — default, red, amber). Caneta records freehand strokes in the selected
    colour as `stroke` pieces; Jogador places a free player (Team by colour: blue → A, red →
    B, other colours → A) labelled by placement order. Cone/Bola take the selected colour.
17. A magnetic board is persisted with the exercise like any other diagram (no unsaved
    scratchpad). Steps may be empty.

**Playback** — wave 4
18. Steps: the board shows the current step index ("Passo 2 de 3"), lets the coach add a step
    (starting from the previous step's end position), delete the current step, and jump between
    steps. Wave 1 ships exactly one implicit step; the step UI arrives in wave 4.
19. **Passo** advances the board to the end state of the next step without animation and wraps
    to the starting position after the last step.
20. **▶ AUTO** animates every step in order: the ball travels its path (flat: linear, lob: along
    the quadratic) while each moved player travels its dashed path, 800 ms per step, then the
    next step starts. AUTO becomes ■ while playing; any edit stops playback and returns to the
    starting position. Nothing bounces (design-system motion rule).

**Platform**
21. Web and iOS ship every wave together (R-024). The mobile board reuses the shared
    geometry/migration/interpolation helpers and re-implements only the gesture layer, as the
    current `court-diagram-editor.tsx` does. Mobile text weights are reached by font family,
    never `fontWeight` (R-025).
22. All copy is pt-PT with English fallback via the existing `training.json` namespaces
    (web `frontend/src/locales/{pt,en}/training.json`, statically imported by mobile `i18n.ts`).

### Acceptance Criteria

#### Board opens in game mode with the 2v2 starting position
- **Given** a coach opens "Novo Exercício"
- **When** the exercise form renders
- **Then** the board shows the Situações de jogo tab active, players A1, A2 in the top half and
  B1, B2 in the bottom half, the Selecionar tool active, and its hint text

#### Ball path toggles between plana and lob
- **Given** the board in game mode with the Bola tool
- **When** the coach taps at (58 %, 20 %) then at (40 %, 80 %)
- **Then** a straight blue ball path is drawn between the two points and a midpoint handle appears
- **When** the coach taps the midpoint handle
- **Then** the path becomes a curve and the diagram step's `ball.style` is `lob`

#### Player movement is a dashed path tied to the player
- **Given** the board in game mode with the Movimentação tool
- **When** the coach taps A1 then taps (20 %, 40 %)
- **Then** a dashed path is drawn from A1 to that point and the step holds `{pieceId: A1, to: {20, 40}}`

#### Tap-to-move and drag both move a piece
- **Given** the Selecionar tool
- **When** the coach taps B2 and then taps (50 %, 85 %)
- **Then** B2 is at (50 %, 85 %)
- **When** the coach drags A2 to (70 %, 30 %)
- **Then** A2 is at (70 %, 30 %)

#### Undo reverts the last change
- **Given** a cone was just placed
- **When** the coach presses undo
- **Then** the cone is gone and the previous board state is restored

#### Saving persists a v2 diagram
- **Given** a board with a ball path and one movement
- **When** the coach saves the exercise
- **Then** `PUT/POST /api/app/exercises` carries `diagram.version = 2`, `mode = "game"`, four
  player pieces, and one step with `ball` and one movement

#### Legacy diagram is upgraded on read
- **Given** an exercise whose stored diagram is
  `{"elements":[{"id":"e1","type":"player_1","x":80,"y":140},{"id":"e2","type":"player_3","x":80,"y":380},{"id":"e3","type":"coach","x":140,"y":260},{"id":"e4","type":"blocker","x":100,"y":100},{"id":"e5","type":"arrow","x":80,"y":140,"endX":80,"endY":380,"curve":30}]}`
- **When** the coach opens it for editing
- **Then** the board is in basket mode with A1 at (25 %, 25 %), B1 at (25 %, 75 %), a feeder at
  (50 %, 50 %), no blocker, and one step whose ball path is a lob from (25 %, 25 %) to (25 %, 75 %)
- **And** saving without further edits stores the v2 shape

#### Thumbnail renders both shapes
- **Given** the exercise list contains one legacy-diagram exercise and one v2 exercise
- **When** the list renders
- **Then** both cards show a court thumbnail with their players and first ball path

#### Basket mode feeds from the feeder (wave 2)
- **Given** the board in Exercícios de cesto mode with the Bola tool
- **When** the coach taps (30 %, 18 %)
- **Then** the step's ball path runs from the feeder position to (30 %, 18 %)

#### Adding players in basket mode (wave 2)
- **Given** basket mode with A1 and A2
- **When** the coach presses "Adicionar jogadores" twice
- **Then** A3 and A4 exist and the control is disabled

#### Pen stroke in magnetic mode (wave 3)
- **Given** Magnético with Caneta and the red swatch selected
- **When** the coach draws a freehand path across the court
- **Then** a `stroke` piece with `color: "red"` and ≥ 2 points is added, and undo removes it

#### Passo steps through the sequence (wave 4)
- **Given** a diagram with two steps, the second moving A1 to (20 %, 40 %)
- **When** the coach presses Passo twice
- **Then** A1 is shown at (20 %, 40 %); a third press returns to the starting position

#### AUTO animates and stops on edit (wave 4)
- **Given** the same diagram
- **When** the coach presses ▶ AUTO
- **Then** the ball and A1 animate through both steps and the button reads ■ while playing
- **When** the coach places a cone mid-playback
- **Then** playback stops and the board returns to the starting position

#### iOS parity (every wave)
- **Given** the iOS app on the same build
- **When** a coach opens the same exercise
- **Then** the board renders the same mode, pieces and steps, and each criterion above passes
  through the Maestro flow for that wave

### Status (2026-09-08, PAD-242)
`implementing`: waves 1 and 2 are built and verified — rules 1–15 and 21–22 (board shell, game
mode, court, undo, v2 model, legacy migration, thumbnails, mode switching with confirmation,
Exercícios de cesto, iOS parity) are implemented; rules 16–17 (magnetic) and 18–20 (steps,
playback) are `draft` pending PAD-244/245. The status flips to `implemented` when wave 4 lands.

### Notes
- Supersedes `training.court-diagram`, which stays `implemented` until wave 1 lands and is
  then marked deprecated with a pointer here.
- Delivery is a wave of four tickets (open-questions #10): (1) board shell + court + game
  mode + migration + thumbnail, (2) basket mode, (3) magnetic pen, (4) steps and playback.
  Rules and criteria above are tagged with their wave; untagged ones are wave 1.
- OPEN: whether the lob bow should be user-adjustable (drag the handle) as today's curve
  handle allows. Wave 1 ships the toggle only.
- OPEN: the design-system skill readme still claims the navy redesign is not in production;
  `packages/config/src/tokens.ts` shows it is. Update the skill separately.
