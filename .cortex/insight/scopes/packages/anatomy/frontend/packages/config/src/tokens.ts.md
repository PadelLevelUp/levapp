---
path: frontend/packages/config/src/tokens.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 280
size_tokens: 2537
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c77e90b53cfb4f9933eb2a93350e0699cd9e8ecb799785ee6d3d37c8689ec450"
---

## Purpose

The single source of truth for LevApp's design tokens (the navy-and-blue brand palette, replacing the original "padel court green"), consumed by both `apps/web` (mirrored by hand into `apps/web/src/index.css`) and `apps/mobile` (via `nativewindTheme()`). Encodes the color system's semantic rules — which hue means what — as raw HSL triplets plus a Tailwind/NativeWind color-block shaper.

## Main players

- `radius` (const, line 22) — supporting. The shared corner-radius token, `"0.625rem"`.
- `ThemeHsl` (interface, lines 24–66) — critical. The full token vocabulary: background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring, class-type colors (`academy`, `private`), status colors (`success`/`warning`/`info` each with a `*Strong` text-on-tint variant), and the sidebar's own chrome colors.
- `lightThemeHsl` (const, lines 68–122) — critical. The resolved light-theme HSL values, heavily annotated with the design rationale for each (e.g. why `warningForeground` is ink not white — contrast fails at ~2.4:1).
- `darkThemeHsl` (const, lines 126–171) — critical. The resolved dark-theme values; explicitly spells out values CSS would otherwise leave to inherit from light via `.dark` non-redefinition.
- `toHslStrings` (lines 173–177) — supporting, unexported helper wrapping each raw triplet as `hsl(...)`.
- `lightTheme` / `darkTheme` (lines 180–183) — critical. Ready-to-use `hsl(...)` strings, derived from the Hsl consts above.
- `nativewindTheme` (lines 189–263) — critical. Shapes a theme (`light` | `dark`) into a Tailwind/NativeWind `theme.extend.colors` block, mirroring the structure of `apps/web/tailwind.config.ts`. Also defines two extra semantic slots not in `ThemeHsl`: `online` (aliases `success`) and `unread` (aliases `primary`).
- `fontFamily` (const, lines 273–276) — supporting. Shared type-stack names (`Poppins` for display, `Plus Jakarta Sans` for body) so web's Tailwind config and mobile's `expo-font` agree.
- `trackingDisplay` (line 279) — supporting. `-0.02em` letter-spacing for display type at 20px+.

## Insights

- This is the SINGLE SOURCE OF TRUTH for color tokens, but there is no build-time generation step: `apps/web/src/index.css` must be hand-mirrored to match these values, and `tokens.test.ts` (outside this file, in the same package) cross-checks by reading that CSS file directly at test time. A change here does NOT propagate automatically — someone must edit both files.
- Documented historical bug: `warning` used to be defined once inside `@layer base` in the CSS while an UNLAYERED `:root`/`.dark` rule silently overrode it (unlayered declarations beat layered ones in CSS cascade). That duplicate/override has been removed; the comment explicitly warns against reintroducing an unlayered token declaration.
- The color system assigns exactly one job per hue and treats deviation as a bug, not a style choice: blue = identity + every primary action; green = "done/confirmed" ONLY (never decorative); amber = "needs the coach". This is why blue was promoted from the old "padel court green" scheme — green had to be freed up to mean one specific thing.
- Only two background colors are allowed system-wide: page grey and white cards (stated directly in the `lightThemeHsl` comment above `background`).
- `nativewindTheme`'s `online` slot used to be a hardcoded `#22c55e` inherited from the old palette; it now aliases `t.success` so it moves with the theme instead of drifting from it.
- `warningForeground` is deliberately ink (not white) in the light theme — white on amber-600 fails WCAG contrast (~2.4:1); this is a concrete example of the file's broader "contrast is computed/checked, never assumed" stance that `calendar-status.ts` inherits.
- Dark theme is treated as the primary brand expression, not an inversion of light — the comment above `darkThemeHsl` states the icon's navy is already the darkest surface, so dark mode is "where the product looks most like itself"; surfaces step UP in lightness (bg → card → popover) rather than relying on borders, and there is no pure black or pure white.

## Connections

Uses: none (leaf module, no imports).

Used by:
- `frontend/packages/config/src/calendar-status.ts`: imports `darkTheme`/`lightTheme` to resolve concrete surface colors (`card`, `foreground`, `mutedForeground`) for its React-Native color-blend emitters, since RN has no CSS `var()` indirection.
- `frontend/packages/config/src/index.ts`: re-exports everything from this module as part of the `@levelup/config` barrel.
- `frontend/packages/config/src/tokens.test.ts` (in the same package): pins these exact values and cross-checks them against `apps/web/src/index.css`.

Semantically related (not imports):
- `apps/web/src/index.css` and `apps/web/tailwind.config.ts` (outside this scope) — hand-mirrored counterparts; `nativewindTheme`'s color-block shape is explicitly designed to mirror the Tailwind config's structure.

## Query pointers

If you need to add or rename a design token, edit `ThemeHsl` plus both `lightThemeHsl`/`darkThemeHsl` here, then hand-mirror the change into `apps/web/src/index.css` (outside this scope), then check `tokens.test.ts` for invariants that may need updating.
If you need calendar/status color blending or contrast decisions, read `calendar-status.ts` next — it's the file that actually consumes `lightTheme`/`darkTheme` for non-CSS (React Native) color math.
