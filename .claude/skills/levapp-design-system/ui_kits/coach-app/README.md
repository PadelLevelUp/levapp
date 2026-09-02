# Coach app — UI kit

A click-through recreation of the LevApp coach app in the redesigned system.
Open `index.html`. Nothing here talks to a server; all data is local fixtures.

## What you can do
- Switch between the six destinations in the tab bar.
- **Painel** → "Convidar 12 jogadores" opens the fill-a-class sheet.
- **Calendário** → the amber dashed block (Aula 12) opens the same sheet. The frame widens for the week grid.
- **Convidar** → tick players, send, watch the class fill and the confirmation replace the list.
- **Jogadores** → the filter pills actually filter.
- **Comunicação** → toggle automation rules; the second tab holds the thread list.
- **Definições** → dark mode. The `Claro / Escuro` control in the margin does the same thing.

## Files
| File | What it is |
|---|---|
| `index.html` | Loader + mount. Fetches the design-system components and these screens into one scope and transpiles with Babel standalone. |
| `Shell.jsx` | Phone frame, tab bar, theme state, plus the small `Treino` and `Definições` screens. |
| `Painel.jsx` | Action queue (plan direction 1b) with the next-class hero pinned above it. |
| `Calendario.jsx` | Week grid built from `ClassBlock`. |
| `Jogadores.jsx` | Player list with the real sort/filter axes. |
| `Mensagens.jsx` | Automations tab + conversations tab. |
| `ConvidarSheet.jsx` | The fill-a-class flow (plan direction 2c). |

## Deliberately blank
**Treino** renders an explicit "por desenhar" placeholder. The screen exists in the
current product as a nav item with no defined content, and the redesign plan proposes
one but nothing has been designed. It is left empty rather than invented.

## Not covered
Player-facing screens (as minhas aulas / o meu progresso / mensagens), the player
profile with its Progresso and Histórico tabs, and the desktop two-pane layouts.
These are described in `../../readme.md` but not built.
