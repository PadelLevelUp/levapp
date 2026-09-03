---
path: frontend/apps/mobile/tailwind.config.js
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 43
size_tokens: 473
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2a39e276d2a45fa520a6601d4ac4aac47881b9fc685b6b7b5bd35d74b89ad201"
---

## Purpose

NativeWind/Tailwind theme config: loads `@levelup/config`'s raw-TypeScript design tokens (`nativewindTheme`, `radius`) through `jiti` at config-load time, registers a per-weight custom font-family utility set matching the faces loaded in `app/_layout.tsx`, and precomputes `borderRadius` literals mirroring web's `calc()`-based tokens.

## Connections

Uses:
- `@levelup/config` (`nativewindTheme`, `radius`), loaded via `jiti` rather than a normal `require`/`import` since `@levelup/config` ships raw TypeScript (`main: src/index.ts`) and Tailwind's own config loader can't transpile it directly: outside this scope (packages).
- `nativewind/preset`: outside this scope, third-party.

Used by: no file within this scope (loaded by the Tailwind/NativeWind toolchain by filename convention, via `metro.config.js`'s `withNativeWind`).

## Insights

- Font-family utility KEYS are deliberately never named `medium`/`semibold`/`bold` — Tailwind would emit `.font-semibold` etc. as a FAMILY utility (`fontFamily.semibold`) and collide with the built-in `.font-semibold` FONT-WEIGHT utility of the same name. Instead each weight gets its own distinctly-named family key (`sans-medium`, `sans-semibold`, `sans-bold`, `display-semibold`) since React Native does not synthesize weights for a custom family — every weight must be its own registered face with its own utility.
- `borderRadius` values are hand-precomputed literals (`lg: radius` i.e. 0.625rem/10px, `md: "0.5rem"`, `sm: "0.375rem"`) rather than the `calc(var(--radius) - Npx)` expressions web's `tailwind.config.ts` uses, because NativeWind/`react-native-css-interop` cannot resolve `calc()` into a numeric `borderRadius` on native — it silently no-ops, producing square corners instead of an error. This is a general trap when porting any web Tailwind token expressed with `calc()` to this config.
