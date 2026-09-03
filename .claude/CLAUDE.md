# LevApp — Padel Coaching Platform

A web + iOS app for padel coaches to manage students, classes, evaluations, and communication.

## Layout

One repository (`PadelLevelUp/levapp`, monorepo since 2026-09-03):

- `backend/` — Flask API (Poetry; see `backend/CLAUDE.md`)
- `frontend/` — npm-workspaces: `apps/web` (React/Vite), `apps/mobile` (Expo), `packages/*` (see `frontend/CLAUDE.md`)
- `.specflow/specs/` + `.specflow/specs-business/` — the spec trees (source of truth); `.cortex/` — rules, bugs, decisions, insight
- `.github/workflows/` — `deploy-staging.yaml` (push to `staging` → staging.levapp.app), `deploy-prod.yaml` (push to `main` → levapp.app), `guard-main-source.yaml`
- `plans/`, `qa/`, `reference/`, `docs/` — plans, QA reports, design sources, infra notes

The Discord→Linear issue bot stays in its own repo, `levelup_issue_bot`.

## Branches and releases

`feature/pad-<id>` → PR into **`staging`** → auto-deploys staging.levapp.app → PR `staging → main` (only `staging` may open one; `/batch-merge-prs` does both hops) → auto-deploys prod. `main` and `staging` are ruleset-protected: no direct pushes, no force-pushes.

## Commands

### Frontend
```bash
cd frontend
npm run dev                                     # Vite dev server (port 8080)
npm test                                        # web unit tests + packages tests (vitest)
npm run test:packages                           # packages/* unit tests only
npm run test:watch                              # vitest watch mode (web)
npm run test:e2e:headless                       # Playwright E2E (headless)
npm run test:e2e:reset                          # Reset/reseed the levelup_test DB only
```

Backend commands live in `backend/CLAUDE.md`; E2E details live in `frontend/apps/web/CLAUDE.md`.

## Environment Secrets

Secrets are stored in `.claude/secrets.env` (gitignored). Source them before running E2E tests or the autonomous workflow:
```bash
source .claude/secrets.env
```

Required variables:
- `POSTGRES_PW` — Postgres password for `padel_app_user` (required for E2E tests)
- `DISCORD_WEBHOOK_URL` — Discord webhook for ticket notifications

## Ticket workflow

Ticket prompts carry the full sequence in a skill — don't restate it here. Both "Implement the following ticket" and "Autonomously implement the following ticket" route to `autonomously-implement-ticket`, which wraps the Cortex specflow skills (`specflow-entry` → `specflow-spec-editor` / `specflow-bugs` → `specflow-tests` → `specflow-plan` → `specflow-develop` → `verification-before-completion`) and opens the PR into `staging` without a review gate. **`specflow-entry` is the mandatory entry point for any request in this repo** — bug reports, feature asks, "what does X do". Branches are `feature/pad-<id>`.

If something is ambiguous, make a reasonable decision and document it in the commit message.

## Hard rule: web and iOS ship together

Anything added to the web app must also be added to the iOS app, **in the same
ticket**, unless there is a very strong reason not to — a capability iOS lacks,
or a surface nobody would use on a phone. "We'll follow up" is not a reason.

Ship web-only only with the reason written down in both the PR body and the
spec. Full guidance, including the mobile i18n static-import trap that silently
breaks a ported screen: `frontend/CLAUDE.md`.

## Conventions

### Commits
Conventional commits referencing the ticket: `feat(PAD-123): add player export` or `fix(PAD-42): calendar crash on empty week`.
