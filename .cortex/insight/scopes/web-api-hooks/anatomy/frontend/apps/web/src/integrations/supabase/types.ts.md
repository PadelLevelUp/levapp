---
path: frontend/apps/web/src/integrations/supabase/types.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 3
size_lines: 597
size_tokens: 4519
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "465a65f0970f4a13100c358a680e964f0ee8b475987b7b2f4d5b1fb72dce8d84"
---

## Purpose

Auto-generated Supabase database types (`Json`, `Database`, plus the `Tables`/`TablesInsert`/`TablesUpdate`/`Enums`/`CompositeTypes` generic helpers Supabase's codegen always emits) for a schema — `calendar_blocks`, `class_instances`, `coach_levels`, `coach_students`, `parent_class_participants`, `parent_classes`, `presences`, `profiles`, `students`, `user_roles` — that predates the app's current Flask/`@levelup/api` backend. Like `./client.ts`, this is **dead code from the Lovable prototype era**: nothing outside this directory imports it, and the real domain types this app uses live in `@levelup/types` (`frontend/apps/web/src/types/index.ts`), a structurally different, independently-maintained type set.

## Main players

- `Json` (lines 1–7) — supporting. Standard Supabase recursive JSON type alias.
- `Database` (lines 9–470) — critical (in size, not in usage). The full generated schema: `public.Tables` (10 tables, each with `Row`/`Insert`/`Update`/`Relationships`), `Views` (empty), `Functions` (empty), `Enums`, `CompositeTypes` (empty).
- `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`, `CompositeTypes<>` (lines 471–585) — supporting. Supabase's standard generic accessor helpers for pulling a row/insert/update/enum shape out of `Database` by name.
- `Constants` (lines 586–596) — supporting. Runtime mirror of the `Enums` shape (currently empty `{}` since the generated schema declared no enum values).

## Insights

- Confirms the `./client.ts` finding: this schema (`calendar_blocks`, `class_instances`, `coach_students`, `parent_classes`, `presences`, `profiles`, `students`, `user_roles`) has no relationship to the current backend's data model or to `@levelup/types`'s domain types (`Player`, `CoachPlayer`, `ClassInstance`, etc.) — table names look similar by coincidence of domain (padel scheduling), not because either was derived from the other.
- Being flagged `centrality: high` reflects its structural weight (597 lines, the largest file in this scope) and its one internal edge (imported by `./client.ts`), not real usage — by import-graph reachability from the app's entry point, both Supabase files are unreachable dead weight.

## File map

- Lines 1–8: `Json` type.
- Lines 9–470: `Database` type — `public.Tables`: `calendar_blocks` (17), `class_instances` (59), `coach_levels` (128), `coach_students` (155), `parent_class_participants` (200), `parent_classes` (236), `presences` (301), `profiles` (358), `students` (388), `user_roles` (418); then empty `Views`/`Functions`, `Enums`, `CompositeTypes` (~440–470).
- Lines 471–585: generic helper types (`Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`, `CompositeTypes<>`).
- Lines 586–597: `Constants` runtime object.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/apps/web/src/integrations/supabase/client.ts`: imports `Database` to parameterize `createClient<Database>`.

## Query pointers

If you're touching anything in `frontend/apps/web/src/integrations/`, first confirm with a grep that nothing new has started importing it — otherwise treat both files here as prototype-era dead code safe to remove alongside the `@supabase/supabase-js` dependency.
If you actually need this app's real domain types, they're in `@levelup/types` (see `frontend/apps/web/src/types/index.ts` in this scope), not here.
