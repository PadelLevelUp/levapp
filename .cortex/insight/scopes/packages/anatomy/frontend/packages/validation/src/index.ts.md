---
path: frontend/packages/validation/src/index.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 158
size_tokens: 1401
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8937438d7dee2d83b9d66939b37d1bd9a4ae2834c8c570632859b163000a5120"
---

## Purpose

Every Zod form-validation schema shared between platforms, one section per form: auth (login), registration, coach/player invitation acceptance, player create/edit (PAD-105: deliberately no `username` field — a coach never sets one, the player picks it at activation), class create (mirrors the web sheet's recurring-class rules: days-of-week and end-date required only when `isRecurring`), exercise create/edit, and availability blocker. Each schema pairs with an exported `z.infer` input type. Comments on several schemas note they intentionally validate LESS than the corresponding form's UX (e.g. class/availability schemas only hard-require what the web `handleSave` checks already enforced, leaving email uniqueness etc. to the server-side `/app/check_field_available` check in `fields.ts`).

## Connections

Uses: `zod` (external).

Used by:
- `frontend/packages/validation/src/index.test.ts`: unit tests for every schema.

Semantically related (not imports): `frontend/packages/api/src/resources/fields.ts` — server-side uniqueness checks these schemas deliberately leave unvalidated client-side.
