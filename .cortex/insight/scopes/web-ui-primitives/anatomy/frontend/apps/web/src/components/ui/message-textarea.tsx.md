---
path: frontend/apps/web/src/components/ui/message-textarea.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 117
size_tokens: 735
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7eaf11835f6724a2cdc247d7bea15efb445ca56466f909edd071ed5570854568"
---

## Purpose

LevApp-specific auto-resizing textarea for chat/message composition, wrapping the base `Textarea` — not a shadcn primitive. Handles three things stock `Textarea` doesn't: (1) autosize-to-content up to `maxHeightPx` via a manual `scrollHeight` measurement effect; (2) configurable Enter-key behavior — `enterBehavior="send"` makes Enter send and Shift+Enter newline, the default `"newline"` makes Enter newline and Cmd/Ctrl+Enter send; (3) an iOS Safari workaround that intercepts `pointerdown` when `isMobile` is true to manually focus the field and pre-empt the browser's scroll-to-reveal-focused-input jump.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/textarea`: `Textarea`, the component this wraps.
- `react`: `forwardRef`, `useImperativeHandle`, `useRef`, `useCallback`, `useEffect`.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
