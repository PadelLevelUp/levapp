# Scheduled tasks after the monorepo move — registration checklist

All payloads live in `~/.claude/scheduled-tasks/` and are already written. Registration only happens from a **Claude Desktop session opened in `~/Documents/Projetos/padel_app/levapp`** (the app accepts task creation only from a session it spawned; "always allow" is not offered, so stay at the keyboard).

## What exists now

| Payload | Origin | Cadence (from its SKILL.md) | Status |
|---|---|---|---|
| `levapp-daily` | Cortex bundle | 02:00 daily | written, unregistered |
| `levapp-weekly-curation` | Cortex bundle | Sat 04:00 | written, unregistered |
| `levapp-weekly-quality` | Cortex bundle | Sun 04:00 | written, unregistered |
| `levapp-test-runner` | Cortex bundle | Sun 06:00 | written, unregistered |
| `levapp-monthly-review` | Cortex bundle | 1st, 06:00 | written, unregistered |
| `levapp-daily-change-report` | your custom task (was `levelup-daily-change-report`) | as before | re-pathed to the monorepo, unregistered |
| `levapp-implement-tickets` | your custom task (was `levelup-implement-tickets`) | as before | re-pathed; now routes through `specflow-entry` | 
| `levapp-linear-report` | your custom task (was `levelup-linear-report`) | as before | re-pathed, unregistered |
| `levapp-test-health` | your custom task (was `levelup-test-health`) | as before | re-pathed, unregistered |
| `levapp-weekly-qa` | your custom task (was `levelup-weekly-qa`) | as before | re-pathed, unregistered |

Dropped: `levelup-once` (a finished one-off: the original mobile-app build brief). Nothing else was removed.

The custom tasks and the Cortex bundles do different jobs and coexist: `test-health` runs the suites and files tickets when they break; Cortex `test-runner` is the code-writing fix loop. `linear-report` / `daily-change-report` are reporting; Cortex `daily` is knowledge hygiene (bug triage, spec drift, insight refresh, session observation).

## Steps (one sitting, ~15 minutes)

1. Quit and reopen Claude Desktop (its task registry is loaded at launch).
2. Open a new session in `~/Documents/Projetos/padel_app/levapp`.
3. Say **"run cortex-register-tasks"** → approve the 5 prompts. Confirm with `cortex tasks verify`.
4. In the same session, register each custom payload with the app's scheduled-task tool, pointing at its `SKILL.md` and keeping the cron it had; set `useWorktree: true` for `levapp-implement-tickets` (it writes code).
5. Delete the old registrations: `levelup-daily-change-report`, `levelup-implement-tickets`, `levelup-linear-report`, `levelup-once`, `levelup-test-health`, `levelup-weekly-qa` — they point at the archived repos and will fail at their next run.
6. The Mac must be awake and on AC power at the cadences above (battery runs get mangled by Power Nap).
