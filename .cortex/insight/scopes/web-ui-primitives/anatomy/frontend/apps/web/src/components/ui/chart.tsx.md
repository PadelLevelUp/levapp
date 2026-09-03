---
path: frontend/apps/web/src/components/ui/chart.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 3
size_lines: 304
size_tokens: 2496
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a759d32aa240fa6e929f204b04252e45d6ae458558eebd37dccf4ae9e05ab5e2"
---

## Purpose

Recharts theming and content-rendering layer: `ChartContainer` sets up a per-chart CSS scope and retheme's Recharts' own inline SVG colors onto the app's design tokens, `ChartTooltipContent`/`ChartLegendContent` replace Recharts' default tooltip/legend rendering with LevApp-styled equivalents, and `ChartConfig`/`useChart`/`getPayloadConfigFromPayload` form the shared config-resolution plumbing all of it depends on. This is the file every chart in the app is built through — high centrality reflects that every `recharts`-based chart imports `ChartContainer` at minimum.

## Main players

- `THEMES` (line 7) — supporting: `{ light: "", dark: ".dark" }`, the CSS-selector prefix map ChartStyle iterates to emit per-theme custom properties.
- `ChartConfig` type (lines 9–14) — critical: per-series config shape. Each key takes `label`/`icon` plus **either** a flat `color` **or** a `theme: {light, dark}` map, never both (enforced via a `{...} | {...}` union with `never`).
- `ChartContext` / `useChart` (lines 16–30) — critical: context hook exposing `{ config }`; throws synchronously if called outside a `<ChartContainer>`, so any custom tooltip/legend content must be a descendant.
- `ChartContainer` (lines 32–59) — critical: the root wrapper. Generates a unique `data-chart` id (from `id` prop or `React.useId()`), renders `ChartStyle` + `RechartsPrimitive.ResponsiveContainer`, and applies a long `[&_.recharts-*]` Tailwind arbitrary-selector block that overrides Recharts' own hardcoded inline `stroke`/`fill` SVG attributes so charts pick up the app's border/muted-foreground tokens instead of Recharts' defaults.
- `ChartStyle` (lines 61–88) — critical: injects a `<style>` tag defining `--color-<key>` CSS custom properties scoped to `[data-chart=<id>]`, one block per `THEMES` entry (so `.dark [data-chart=x] { --color-foo: ... }` alongside the light block). Only emits a property for a config key that actually has a `color` or matching `theme` entry.
- `ChartTooltip` (line 90) — supporting: raw re-export of `RechartsPrimitive.Tooltip`.
- `ChartTooltipContent` (lines 92–226) — critical: the largest block in the file. Resolves the tooltip's label (via `getPayloadConfigFromPayload`, with a `labelFormatter` override path), then renders one row per payload item — an icon (if `itemConfig.icon` is set) or a colored swatch (`dot`/`line`/`dashed` variants) plus name and formatted numeric value — with a `formatter` prop escape hatch that replaces per-item rendering entirely.
- `ChartLegend` (line 228) — supporting: raw re-export of `RechartsPrimitive.Legend`.
- `ChartLegendContent` (lines 230–275) — parallels `ChartTooltipContent`'s icon-or-swatch logic for the legend row.
- `getPayloadConfigFromPayload` (lines 278–301) — critical, exported: shared helper that resolves a Recharts payload item to its `ChartConfig` entry. Does a two-level lookup — the item's own `key` field first, then `item.payload`'s `key` field — before falling back to the raw `key` string, to handle both Recharts payload shapes (a direct data point vs. one nested under `payload`).

## Insights

- The retheming mechanism is entirely CSS-attribute-selector based, not prop-based: `ChartContainer`'s className contains selectors like `[&_.recharts-dot[stroke='#fff']]:stroke-transparent` that override Recharts' own hardcoded inline `stroke`/`fill` SVG attributes via Tailwind arbitrary variants. Recharts is never told about the app's colors directly for these structural elements — anyone adding a new Recharts sub-component (a new chart type, a new decoration) to a chart needs to add a matching selector to this block, or it renders with Recharts' hardcoded defaults (`#ccc`, `#fff`) regardless of the active theme.
- `useChart()` throws if called outside `<ChartContainer>` — this is a hard runtime dependency, not a lint-time one; a `ChartTooltipContent`/`ChartLegendContent` rendered outside the container tree (e.g. via a portal that escapes it) will crash.
- `getPayloadConfigFromPayload`'s two-level lookup exists because Recharts payload items can appear either as `{ dataKey, name, value, ... }` directly or with the actual data point nested under `item.payload` — code adding new chart types needs to know which shape applies rather than assuming one.
- `ChartConfig`'s `color`/`theme` union is mutually exclusive by type (`color?: string; theme?: never` vs. the reverse) — a config author cannot set both, and TypeScript enforces it structurally rather than at runtime.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `createContext`, `useContext`, `useId`, `forwardRef`, `useMemo`.
- `recharts`: `ResponsiveContainer`, `Tooltip`, `Legend`, and their prop types (aliased `RechartsPrimitive`) — the library this entire file themes and extends.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives`, so no consuming chart/feature files were provided. Given `centrality: high`, this is almost certainly imported by every dashboard/analytics chart in `apps/web`.

## Query pointers

If you need to add a new chart, read: `ChartContainer` + `ChartConfig` first (how to declare per-series colors), then `ChartTooltipContent`/`ChartLegendContent` only if the default tooltip/legend rendering isn't enough.
If a Recharts sub-element renders with the wrong (hardcoded) color, read: `ChartContainer`'s className selector block first — you likely need to add a matching `[&_.recharts-*]` override there, not touch `ChartStyle` (which only handles named `--color-<key>` custom properties, not Recharts' own stroke/fill defaults).
If you need to change how tooltip/legend values are formatted, read: the `formatter`/`labelFormatter` escape hatches in `ChartTooltipContent` before adding a new prop.
