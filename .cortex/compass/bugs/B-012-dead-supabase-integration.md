---
id: B-012
title: "Dead Supabase integration left from the Lovable prototype"
type: layer-drift
severity: low
status: resolved
affects:
  - frontend/apps/web/src/integrations/supabase/client.ts
  - frontend/apps/web/src/integrations/supabase/types.ts
proposed_fix: "Delete apps/web/src/integrations/supabase/ and drop @supabase/supabase-js from apps/web/package.json; the old anon key was purged from git history on 2026-09-03."
opened: 2026-09-03T14:30:00Z
fixed: 2026-09-09T00:00:00Z
fixed_by: PAD-177
---

# B-012 — Dead Supabase integration left from the Lovable prototype

A repo-wide grep finds zero importers of `integrations/supabase/*` outside its own directory. It reads env vars that are no longer set. It exists only because the project started as a Lovable prototype; it is a deletion candidate and a misleading signal to readers about the data layer.

*Surfaced by the initial Cortex insight extraction (web-api-hooks scope), 2026-09-03.*
