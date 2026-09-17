# Pulse — index

**Read this when:** you are reviewing loop proposals, or a loop asks you to act on a
suggestion. Everything here is transient and gitignored.

**What's here:**
- `suggestions.md` — the gate: S-NNN proposals awaiting a yes/no. Persists.
- `dismissed.md` — rejection memory, so a declined suggestion is not re-raised.
- `reports/` — one report per loop run, overwritten each run.
- `state/` — machine working state (counter, worklists, per-session read ledgers).
- `extraction/` — insight-extraction plan, progress and fragments.

**How to navigate:** start at `suggestions.md`. Nothing here is authority — a
suggestion becomes durable only by landing in `compass/` or `atlas/` through the gate.
