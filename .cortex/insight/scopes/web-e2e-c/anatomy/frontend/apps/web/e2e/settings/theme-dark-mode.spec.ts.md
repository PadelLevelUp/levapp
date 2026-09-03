---
path: frontend/apps/web/e2e/settings/theme-dark-mode.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 85
size_tokens: 666
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c42d87e13668dd0ed550d9a6b490f6cd47940f6d02cc6b590b3e27e7e6781f55"
---

## Purpose

PAD-57: Settings > Preferences "Theme = Dark" had no effect — `next-themes`
was installed but no `<ThemeProvider>` wrapped the app, and the Theme
`<Select>` only mutated local React state. Proves choosing Dark now toggles
the `.dark` class on `<html>` instantly (no Save button needed, like
Language), writes `localStorage.theme`, and survives a reload with the select
still showing "Dark" (not reverted to "System"). Runs at a fixed desktop
viewport because the Settings language/theme controls hang under mobile.
Switches back to Light at the end so the browser context isn't left dark for
later specs.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): the `next-themes` `ThemeProvider` wiring
in the app shell and the Theme `<Select>` in the Preferences tab.
