---
name: lovable-prototype-dead-code
---

# lovable-prototype-dead-code

`frontend/apps/web/src/integrations/supabase/` (`client.ts`, `types.ts`) is a leftover from this app's original Lovable-generated prototype, before it was rebuilt on the current Flask/`@levelup/api` backend. A repo-wide grep for `integrations/supabase` under `frontend/apps/web/src` and `frontend/packages` finds zero importers outside the directory itself — nothing in the running app constructs or references the exported `supabase` client, and its `Database` schema (`calendar_blocks`, `class_instances`, `coach_students`, `parent_classes`, `presences`, `profiles`, `students`, `user_roles`) has no relationship to `@levelup/types`'s real domain types despite superficially similar table names. Both files are auto-generated ("Do not edit it directly") Supabase-tooling artifacts, not hand-maintained app code.

**Implementing files:**
- `frontend/apps/web/src/integrations/supabase/client.ts` — the orphaned `createClient` instantiation.
- `frontend/apps/web/src/integrations/supabase/types.ts` — the orphaned generated schema types.

**Related concepts:** none within this scope.
