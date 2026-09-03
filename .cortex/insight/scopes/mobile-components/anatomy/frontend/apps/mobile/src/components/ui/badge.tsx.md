---
path: frontend/apps/mobile/src/components/ui/badge.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 55
size_tokens: 401
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c32983b292f3eb000fc16157a66d81c49aa963c460d8973d1e462d2d25718ab8"
---

## Purpose

`Badge` is a small rounded-pill label with six `cva`-driven variants
(`default`, `secondary`, `destructive`, `success`, `warning`, `outline`),
each pairing a background (`badgeVariants`) with a matching text color
(`badgeTextVariants`) propagated to children via
`TextClassContext.Provider` — the same variant-pairing pattern `button.tsx`
uses. Both variant functions are exported so callers can compute the same
classes outside a `Badge` instance if needed. Note: this `Badge` uses
`rounded-full` (a full pill); the web design system's `Badge`
(`apps/web/src/components/ui/badge.tsx`) uses `rounded-md` and carries an
explicit comment reserving full pills for filter controls and the smaller
radius for status chips like this one — worth checking whether the mobile
shape is an intentional platform choice or drift from that rule.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: `TextClassContext`
  supplies the variant-matched text color to the badge's label.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be consumed for status/tag labels throughout feature
screens, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/button.tsx`
— same `cva` variant + `TextClassContext.Provider` pairing pattern
(container variant classes plus a matching text-variant function), and
`badge.tsx`'s variant set (`default`/`secondary`/`destructive`/`success`/
`warning`/`outline`) closely mirrors `button.tsx`'s.
