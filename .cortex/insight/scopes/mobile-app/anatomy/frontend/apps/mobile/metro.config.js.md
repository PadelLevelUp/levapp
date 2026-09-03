---
path: frontend/apps/mobile/metro.config.js
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 50
size_tokens: 444
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9c979a97ba39881f86d7934f15ec673049fb83107c91089063aaaae88488c138"
---

## Purpose

Metro bundler config for the monorepo setup: watches the whole workspace root (so raw-TypeScript `@levelup/*` packages resolve and hot-reload without a build step), resolves the `@/` source alias to `src/`, and pins `react`/`react-native`/`react-native-css-interop` to the app's own `node_modules` copy to prevent a duplicate React instance being pulled in from a package that resolves its own copy.

## Connections

Uses: none tracked (no static imports; a Metro config object requiring `expo/metro-config`, `nativewind/metro`, and Node's `path`, all outside the scope's file set).

Used by: no file within this scope (loaded by the Metro toolchain by filename convention).

## Insights

- The `@/` alias is handled here in `resolver.resolveRequest`, NOT via tsconfig `paths` — a comment notes `app.json`'s `experiments.tsconfigPaths` is deliberately `false` because tsconfig `paths` there aliases `react` → `@types/react` for type-checking purposes only, which would conflict with Metro's runtime resolution if tsconfig paths were also used at bundle time.
- The singleton-pinning logic exists specifically because the web app hoists React 18 to the workspace root — without pinning, an import originating from a root `packages/` module (`@levelup/*`) would resolve `react`/`react-native` against that hoisted copy instead of the app's own, producing two React instances in one bundle (a classic "Invalid hook call" source).
