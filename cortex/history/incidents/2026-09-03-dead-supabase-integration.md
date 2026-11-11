---
about: Dead Supabase integration left from the Lovable prototype
permanence: stable
verified: "2026-09-03 (observed)"
origin:
  - migrated:compass/bugs/B-012-dead-supabase-integration.md@ef7a5f3
need:
  - frontend/apps/web/src/integrations/supabase/client.ts
  - frontend/apps/web/src/integrations/supabase/types.ts
aliases:
  - B-012
  - B-012-dead-supabase-integration
---

# B-012 — Dead Supabase integration left from the Lovable prototype

A repo-wide grep finds zero importers of `integrations/supabase/*` outside its own directory. It reads env vars that are no longer set. It exists only because the project started as a Lovable prototype; it is a deletion candidate and a misleading signal to readers about the data layer.

*Surfaced by the initial Cortex insight extraction (web-api-hooks scope), 2026-09-03.*

<!-- 3.x fields of compass/bugs/B-012-dead-supabase-integration.md, carried verbatim by cortex migrate -->
```yaml
type: layer-drift
severity: low
status: resolved
affects:
  - frontend/apps/web/src/integrations/supabase/client.ts
  - frontend/apps/web/src/integrations/supabase/types.ts
proposed_fix: "Delete apps/web/src/integrations/supabase/ and drop @supabase/supabase-js from apps/web/package.json; the old anon key was purged from git history on 2026-09-03."
fixed: "2026-09-09"
fixed_by: PAD-177
```
