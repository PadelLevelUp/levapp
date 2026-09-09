# Screens — element-by-element extraction

All three artboards share: 393px frame, 44px radius, `surface-page` background.

## Shared chrome

| Element | Spec |
|---|---|
| Screen header | `lv-ink-900` background; iOS status bar (dark); row `padding 4px 20px 18px`, gap 12: `levapp-mark-on-dark.svg` 28×28 + title "Calendário" in `text-display-sm` (600 20px/1.25 display font), `tracking-display` (−0.02em), colour `text-on-navy` (white) |
| Segmented control | row, gap 4, `padding 10px 16px`, `surface-card` bg, 1px `border-subtle` bottom; each segment `flex:1`, height 30, radius 8, `600 12px/1 body`; active = `lv-navy-800` bg + `text-on-navy`; idle = transparent + `text-tertiary`. Segments: Dia, Semana, Mês |
| Selected-day header | row, gap 14: 48px circle `lv-navy-800` bg, `700 20px` tabular white day number; then `text-display-sm` full label ("segunda-feira, 7 setembro") in `text-primary` and a `text-body` `text-secondary` count line ("1 aula" / "N aulas") |
| Card: class | `action-primary` bg, `radius-xl` (16px), padding 16; title `text-title` (700 15px/1.35) `text-on-accent`; row mt 4 gap 6 `text-body` rgba(255,255,255,.85) tabular: time "12:00 – 13:30" + "↻" glyph; row mt 14 gap 10: track 6px tall `radius-pill` rgba(255,255,255,.25) with white fill at `filled/capacity`%, then `700 13px` tabular white "6/6" |
| Card: break | `surface-card` bg, `1.5px dashed border-default`, `radius-xl`, padding 16; title `text-title` `text-primary`; time row `text-body` `text-secondary` + "↻" |
| Card: alert | `status-problem-solid` bg, `radius-xl`, padding 16; title only, `text-title` `text-on-accent` |
| Card list | column, gap 12, `padding 12px 20px 24px` |
| Tab bar (frame chrome) | 7-column grid, `surface-card`, top `border-subtle`; active item `surface-accent` 32×24 radius-8 pill with `action-primary` icon, label `600 9px/1.2`. Mock only — product tab bar is six items (decision 2026-09-04) |

## Artboard 1 — Dia

1. Header, segmented control (Dia active).
2. **Week strip row**: `padding 12px 16px`, `surface-card`, bottom `border-subtle`; `‹` and `›` chevrons (`700 18px`, `text-tertiary`) flanking a `space-between` row of seven day columns. Each column: `padding 2px 4px`, radius 10, column bg `surface-accent-soft` when selected else `surface-card`; abbreviation `700 8.5px` letter-spacing .05em, `text-accent` when selected else `text-tertiary`; date circle 28×28, `700 13px` tabular; selected → `lv-navy-800` bg, white; today (unselected) → transparent bg, `text-accent` number, `inset 0 0 0 2px action-primary` ring; otherwise transparent, `text-primary`.
3. **Selected-day header** on `surface-page`, `padding 20px 20px 8px`.
4. **Card list**, `min-height 260`.
5. Tab bar.

Interaction: tapping a column selects that day; chevrons page the week.

## Artboard 2 — Semana

1. Header, segmented control (Semana active).
2. **Nav row**: `padding 12px 16px`, `surface-card`, bottom `border-subtle`; left `Hoje` button (height 34, `padding 0 14px`, `radius-pill`, 1px `border-default`, `surface-card`, `text-label` 600 13px `text-primary`); centre: `‹` + range label `text-body-strong` tabular ("7 – 13 set") + `›`, gap 18.
3. **Day header row**: `surface-card`, bottom `border-subtle`; 26px gutters left/right; seven `flex:1` columns `padding 10px 2px 8px`, bg `surface-accent-soft` when selected; abbreviation `700 9.5px`; circle 26×26 with the same selected/today treatment as Dia.
4. **Time grid**: container height 420 (mock), `surface-page`, `overflow hidden`. Left/right 26px gutters carry hour labels (`600 8px` `text-tertiary` tabular) at `(h − HOUR_START) × rowH`; HOUR_START 10, HOUR_END 16 in the mock, rowH = height / hours. Seven columns, `border-left border-subtle`, column bg `surface-accent-soft` when selected, hour rules `border-top border-subtle`. Events: absolute, `left/right 2px`, top = start-minutes/60 × rowH, height = max(18, duration/60 × rowH), radius 6, `padding 2px 4px`, bg/colour by variant (class `action-primary`/white, break `surface-sunken`/`text-secondary`, alert `status-problem-solid`/white), title `700 8.5px/1.15` clamped to 2 lines. Tapping a column selects that day.
5. **Bottom sheet** over the grid: absolute, `top = sheetTop` (default 250 of 420, clamp 70…330), `surface-page`, `radius 20px 20px 0 0`, shadow `0 −10px 24px rgba(11,21,36,.14)`; 18px grab row with a 32×4 `border-default` pill (pointer-drag resizes); selected-day header `padding 4px 20px 8px`; scrollable card list.
6. Tab bar.

## Artboard 3 — Mês

1. Header, segmented control (Mês active).
2. **Month nav**: centred `‹` + `text-body-strong` "Setembro 2026" + `›`, gap 18, `surface-card`, bottom `border-subtle`.
3. **Weekday header**: 7-col grid, `padding 10px 10px 0`, labels `700 9.5px` `text-tertiary` letter-spacing .05em, SEG…DOM (Monday start).
4. **Month grid**: 7-col grid gap 2, `padding 0 10px 16px`; cells `padding 6px 0 8px`, radius 10, bg `surface-accent-soft` when selected; circle 26×26 `700 12.5px` tabular with the selected/today treatment; out-of-month cells at opacity .32 and not selectable; below the circle a 5px-tall row of up to three 5px dots (gap 2) coloured class `action-primary`, break `text-tertiary`, alert `status-problem-solid`. Cell count = ceil((firstDow + daysInMonth)/7) × 7.
5. **Single-day time grid**: same 420px container with `border-top border-subtle`; one wide column (`border-left/right border-subtle`) showing the selected day's events with `padding 3px 6px` and `700 9.5px/1.15` titles.
6. **Bottom sheet**: identical to Semana's, independent `monthSheetTop` state.
7. Tab bar.

## Mock data and labels (Portuguese)

- Week 7–13 September 2026, today = Monday 7, initial selection = today.
- Events: "Preparação Mundial" 12:00–13:30 class 6/6 (every day); "Almoço" 15:00–16:00 break (Mon–Fri); "VV" 10:00–10:30 alert (Thursday only).
- Weekday abbreviations SEG TER QUA QUI SEX SÁB DOM; full names segunda-feira … domingo; count label "1 aula" / "N aulas"; `Hoje`; range "7 – 13 set"; month "Setembro 2026".
