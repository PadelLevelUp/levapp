---
path: frontend/apps/web/tailwind.config.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 141
size_tokens: 1205
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1a012102aadd3ad75f2e89a6b13cb6a71404600e9e8ce25ce1a2bef440915155"
---

## Purpose

Tailwind theme configuration for the web app: class-based dark mode, content globs over `pages/components/app/src`, a centered container, and an `extend` block mapping every design-system color/radius token to a CSS custom property (`hsl(var(--foreground))` etc.) so Tailwind utilities like `bg-primary` resolve to the runtime-themeable variables defined in `index.css` (outside this scope). Also defines the `sans`/`display` font stacks (Plus Jakarta Sans / Poppins) and a set of keyframe animations (accordion, slide-in, fade-in, message-in, shimmer, wave) used across the UI for sheets, skeletons, and chat bubbles. Loads the `tailwindcss-animate` plugin.

## Connections

Uses: `tailwindcss` (external, `Config` type); `require("tailwindcss-animate")` (external plugin).

Used by: the PostCSS/Tailwind build pipeline (`postcss.config.js`, this scope) when compiling `src/index.css` (outside this scope); every component using Tailwind's theme-derived utility classes (`bg-primary`, `text-success-strong`, `animate-shimmer`, etc.) across the whole frontend, not resolvable to specific files from this scope's import graph.
