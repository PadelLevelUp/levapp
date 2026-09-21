# Design-system usage in the canvas

The canvas imports `_ds/levelup-design-system-fec52606-4a04-47e9-ad19-0cdf6c22707c/` (tokens
`fonts`, `colors`, `typography`, `spacing`, `elevation`, `motion`, `dark`, `styles.css`,
`_ds_bundle.js`; L11–19). The bundle was **not on disk** at ingestion, so token *values* and
component internals are unknown here; only names and usage are recorded.

## Components (`LevelUpDesignSystem_fec526.*`)

| Component | Used for | Lines |
|---|---|---|
| `Icon` | nav icons `painel`, `calendario`, `jogadores`, `treino`, `mensagens`, `definicoes` | L37, L642–647 |
| `SegmentedControl` | theme "Claro"/"Escuro" | L44 |
| `Card` (default, `tone="sunken"`, `tone="inverse"`) | profile, summary cards, new-evaluation form (sunken), share preview (inverse) | L52, L85, L108, L276, L295, L330, L426 |
| `Badge` (`tone="progress"`, `"neutral"`, `size="sm"`) | "Fora do âmbito", "Nível 4-", hand | L53, L91–92 |
| `ClassBlock` | calendar class tile (title, time, court, level, filled, capacity, status `now`/`scheduled`) | L66 |
| `PlayerRow` | player list row (name, level, hand) | L79 |
| `Avatar` (`size` sm/md/xl, `tone="accent"`) | participants, profile | L87, L195, L224 |
| `Button` (`variant` primary/secondary/ghost/danger; `size` sm/md/lg; `fullWidth`; `disabled`) | every action | throughout |
| `Eyebrow` (optional `action` + `onAction`) | section headers; "Avaliações" carries the inline action "Gerir competências" | L137, L191, L218, L269, L324, L369, L379, L408 |
| `FilterPill` (`active`) | reminder frequency, evolution competency, share evolution period | L147, L298, L411 |
| `Input` (`multiline`, `type="number"`, `suffix`, `hint`, `placeholder`) | private note, custom competency, custom reminder | L151, L243, L289, L382 |
| `Toggle` | "Modo escuro" | L139 |

Stars, checkboxes, the accordion "+" and the line chart are **hand-built** in the canvas (inline
SVG / spans), not design-system components (L237, L372, L227, L301–307).

## Semantic tokens carrying meaning

| Token / literal | Meaning in the canvas | Lines |
|---|---|---|
| `--status-progress-solid` | filled star (fill and stroke); chart line and dots | L575–576, L302–304 |
| `--surface-card` + `--border-default` | empty star | L575–576 |
| `--status-done-solid` | evolution delta text (used even when negative — mock defect) | L314 |
| `#5FD3AC` | evolution text on the dark preview card | L440 |
| `--text-on-navy-muted`, `#fff` | labels and text on the `inverse` card | L427–443 |
| `--action-primary` | checked checkbox fill, active nav text, selected-row bar | L687, L659, L693 |
| `--surface-accent`, `--surface-accent-soft` | active nav item, selected player row | L658, L693 |
| `rgba(11,21,36,0.45)` | scrim behind drawers and modals | L162, L259, L364, L394 |
| `--transition-control` | accordion "+" rotation | L227 |

Type styles used: `--text-display-lg`, `--text-display-sm`, `--text-title`, `--text-body`,
`--text-body-strong`, `--text-caption`; fonts `--font-display`, `--font-body`;
`--tracking-display`. Spacing `--space-1`…`--space-6`; radii `--radius-sm`, `--radius-md`,
`--radius-2xl`; elevation `--shadow-lg`; `--control-height-md`. Theme via `data-theme` on the
root (L28).

## Sizes that matter

Stars 20 px in entry forms (L237, L283), 16 px read-only (L345, L434). Chart viewBox 480×140,
padding 24, y mapped from 1–5 (L712–714). Competency label column 130 px in the class panel,
150 px elsewhere (L233, L279, L342).
