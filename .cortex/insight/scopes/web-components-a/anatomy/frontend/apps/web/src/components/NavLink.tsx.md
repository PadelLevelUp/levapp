---
path: frontend/apps/web/src/components/NavLink.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 29
size_tokens: 188
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c09f73102288d8a89e5e7b728715ba0697783c43b687e20dedce3536aa7049df"
---

## Purpose

A thin `forwardRef` wrapper around react-router-dom's `NavLink` that swaps its function-as-className API for plain `className`/`activeClassName`/`pendingClassName` string props, merged via `cn`. Exists to let call sites style active/pending nav links with ordinary Tailwind classes instead of writing an inline `({isActive, isPending}) => ...` callback at every usage.

## Connections

Uses: `react-router-dom` (`NavLink` as `RouterNavLink`, `NavLinkProps`), `react` (`forwardRef`), `@/lib/utils` (`cn`) — all outside this scope.

Used by: no file in this scope imports it (no in-scope or crossing edge recorded); likely consumed by app-shell/navigation components outside `web-components-a`.
