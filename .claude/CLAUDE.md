# LevelUp — Padel Coaching Platform

A web app for padel coaches to manage students, classes, evaluations, and communication.

## Repos

Three independent git repos live side by side under this (non-git) umbrella dir: `backend/` (Flask), `frontend/` (npm-workspaces monorepo — see its own CLAUDE.md), `levelup_issue_bot/`. Spec tree in `specs/` (markdown, `_index.md` + feature dirs).

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

Ticket prompts carry the full sequence in a skill — don't restate it here. Both "Implement the following ticket" and "Autonomously implement the following ticket" route to `autonomously-implement-ticket`, which opens the PR without a review gate. (The review-gated variant, `implement-ticket`, is disabled in `.claude/settings.local.json` under `skillOverrides` — delete that entry to get the Tailscale/Discord stop-for-review flow back.) This repo has a `specs/` tree, so `specflow-change-router` runs first and the skill classifies against the specs before writing code. Branches are `feature/pad-<id>`, created by the SessionStart hook in `.claude/settings.local.json`.

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
