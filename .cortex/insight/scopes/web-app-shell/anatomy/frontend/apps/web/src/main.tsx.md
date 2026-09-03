---
path: frontend/apps/web/src/main.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 3
size_lines: 15
size_tokens: 101
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2194c759c708f20562e88e19477f9d1c0ee9504899ee4579f66cc3d564fa470b"
---

## Purpose

The web app's true entry point (Vite's configured module entry). Registers the push service worker, then mounts `<App />` into `#root` via React 18's `createRoot`. Everything else in the app hangs off the tree this file starts.

## Main players

- Top-level module body (lines 1–14, critical) — no functions, just side effects run at import time: conditionally register `/sw.js` on `window load` if `"serviceWorker" in navigator` (lines 6–12, warning logged to console on failure rather than thrown), then `createRoot(document.getElementById("root")!).render(<App />)` (line 14). The non-null assertion on `getElementById("root")` assumes `index.html` always has that element.

## Insights

- Service worker registration is deferred to the `window` `load` event rather than fired immediately — standard practice to avoid competing with the initial page load for network/CPU, but it means push notifications aren't available until after `load` fires, not at first paint.
- The `./i18n` import has no binding (`import "./i18n"`) — it exists purely to run `i18n.ts`'s module-level `i18n.use(...).init(...)` side effect before `App` (and its `I18nextProvider`) renders. Import order here matters: it precedes `./App.tsx` in the file.
- `./index.css` import is the only cross-scope edge out of this file (`edges_crossing_scope` in the extraction slice) — global styles/Tailwind layers live outside this scope.

## Connections

Uses: `./App.tsx` (default `App` component, this scope), `./i18n` (side-effect only, this scope), `./index.css` (outside this scope — global stylesheet), `react-dom/client` (external, `createRoot`).

Used by: nothing in-repo — this is the Vite build/dev-server entry point referenced from `index.html`'s `<script type="module" src="/src/main.tsx">` (outside this scope).

## Query pointers

If you need to change how the app boots (provider order, service-worker registration, root mounting), this file and `App.tsx` are the two to read together. If you're debugging why push notifications aren't ready immediately on load, this file's deferred registration is the first place to check, then `src/utils/pushNotifications.ts` and `public/sw.js`.
