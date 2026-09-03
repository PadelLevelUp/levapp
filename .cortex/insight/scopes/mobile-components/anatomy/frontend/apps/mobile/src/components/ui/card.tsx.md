---
path: frontend/apps/mobile/src/components/ui/card.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 55
size_tokens: 377
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "de798ec39cfe5cc3e0e3ecfbcd29a3c373b1575e4f8ae59f3ba8f969d7b7f5a6"
---

## Purpose

`Card` and its compound parts (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`) form the standard bordered/rounded container
used to group related content. `Card` sets `TextClassContext` to
`"text-card-foreground"` so any `Text` nested inside inherits the right
color without repeating a className; `CardTitle` additionally sets
`role="heading"`/`aria-level={3}`. Note: this `Card` applies `shadow-sm`,
while the web design system's `Card` (`apps/web/src/components/ui/card.tsx`)
carries an explicit comment stating cards should have NO shadow ("the one
shadow family is reserved for things that genuinely float") — worth
checking with design before treating the mobile shadow as intentional
platform divergence vs. drift.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: `Text` for
  `CardTitle`/`CardDescription`; `TextClassContext` for the ambient card
  text color.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used broadly across feature screens as the
general-purpose content container, outside this scope.
