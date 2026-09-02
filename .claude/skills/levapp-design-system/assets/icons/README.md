# Icons

The current app uses a **thin outline set — 24px grid, 2px stroke, round caps,
geometric, no fills** — rendered in `--text-tertiary` when resting and
`--action-primary` when active. That style matches **Lucide** almost exactly, so
Lucide is the system's icon set.

Icons are rendered through `components/core/Icon.jsx`, which carries Lucide's path
geometry inline (ISC licence). No CDN, no icon font, no `<img>` — glyphs inherit
`currentColor` so they theme correctly in dark mode.

## Mapping to the app's tab bar

| Destination | Icon key | Lucide glyph | Fidelity |
|---|---|---|---|
| Painel | `painel` | `layout-grid` | Close. The app's version is filled (two dark, two light squares); ours is outlined for consistency with the rest of the set. |
| Calendário | `calendario` | `panel-top` | Faithful — the app's icon is a rounded rectangle with a top bar and no date ticks. |
| Jogadores | `jogadores` | `user` | Exact. |
| Treino | `treino` | `clipboard-list` | **⚠ Stand-in.** The app's icon is a **padel racket**, which has no Lucide equivalent. `clipboard-list` matches Treino's redesigned meaning (exercise and session library), not its current drawing. |
| Mensagens | `mensagens` | `message-square` | Exact. |
| Definições | `definicoes` | `crosshair` (r=4) | Close. The app's icon is a ringed dot with four dashes; ours is the same construction on Lucide's grid. |

Utility glyphs also available: `check`, `back`, `plus`, `search`.

## ⚠ Still needed from you

These were read from a **screenshot**, not from source. Screenshots are lossy and two
glyphs here are bespoke sport iconography that no open set contains.

**Send the app's real SVGs** (or the icon font / sprite) and they go straight into this
folder and into `Icon.jsx` — in particular:

1. **Treino** — the padel racket. Currently a stand-in.
2. **Definições** — the ringed-dot mark, if it is a brand glyph rather than a generic crosshair.
3. Any icon used outside the tab bar (row chevrons, overflow menus, attendance marks),
   none of which have been seen.
