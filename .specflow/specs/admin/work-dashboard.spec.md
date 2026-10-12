---
id: admin.work-dashboard
status: implementing
depends_on: [admin.foundation]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-024, R-036]
---

# admin.work-dashboard

> Linear: PAD-555 (owner request 2026-10-08). Scope proposed 2026-10-12 on defaults; the owner's
> answers on the summary source, the roles and TestFlight may change rules 2, 6 and the Notes.

### Intent
The owner wants one page in the staff console that says what is left to do, what was done and what
has shipped, without opening Linear and GitHub. Read-only. The data comes from Linear and GitHub
through the backend; their tokens never reach the browser.

### Entities
- **READS:** nothing in LevApp's database. Linear issues (team `PAD`) and the GitHub repository's
  pull requests, commits on `main` and the two deploy workflows' runs, over their HTTP APIs.
- **WRITES:** nothing.

### Rules
1. **One endpoint.** `GET /admin/api/work` answers `{fetchedAt, linear, github}`. Each source is
   `{status: "ok" | "not_configured" | "unavailable", ...}` on its own, so one source failing or
   unset never hides the other.
2. **Tickets (Linear).** With `LINEAR_API_KEY` set: `open` (state type backlog, unstarted or
   started) ordered by state (in progress, to do, backlog), then priority (urgent first, none last), each with id, title,
   state, priority, assignee, `createdAt`, url and a `summary`; and `done` (completed in the last
   30 days), newest first; up to 3 pages of 100 each, and a section past that says it is
   `truncated`. The summary is the description as plain text (Markdown, links and
   Linear's mention tags removed), cut at a word to at most 200 characters with "…"; empty when the
   ticket has no description. No AI.
3. **Pull requests (GitHub).** `merged`: PRs into `staging` or `main` merged in the last 30 days,
   newest first, each with number, title, url, base, `mergedAt`, the PAD ids in its branch and
   title, and `where`: `staging` when its merge commit is among the commits staging has and `main`
   does not (`compare/main...staging`), else `production`. This holds because promotions are merge
   commits; a squash or rebase promotion would leave every PR `staging`. A staging → main promotion
   is not listed (it is the release of the PRs it carries); another PR into `main` is `production`.
   Closed PRs are read up to 5 pages of 100, newest update first, stopping once a page ends before
   the window; past the cap the section is `truncated`. `open`: open PRs, each with number, title,
   url, base, draft, and `checks` (`success`, `failure`, `pending` or `null` when unknown; a failing
   checks query leaves them `null` and the rest of GitHub `ok`).
4. **Deploys (GitHub).** The last 5 runs of `deploy-staging.yaml` and of `deploy-prod.yaml`:
   status/conclusion, short sha, `createdAt`, url.
5. **Settings, tokens and limits.** `LINEAR_API_KEY` (a secret) is required for tickets.
   `WORK_GITHUB_REPO` names the repository; the deploy workflows set it to their own repository, and
   unset (tests, local runs) the GitHub part is `not_configured` and never called.
   `WORK_GITHUB_TOKEN` (a secret; GitHub Actions reserves `GITHUB_*` names) is optional because the
   repository is public: without it the GitHub part uses the unauthenticated API (60 calls an hour,
   about 7 per refresh) and `checks` are `null`. No token is ever sent to the client or logged.
6. **Who sees it.** `operator` and `owner` (support gets 403). Nav entry "Trabalho".
7. **Freshness.** Fetched when the page opens and cached in the server process (one worker, R-027)
   for 5 minutes, or 30 seconds when a source is `unavailable`; "Atualizar" asks for `?refresh=1`,
   honoured at most once a minute counted from the last fetch of any kind. Every outside call has a
   10-second timeout. A failed refresh says so on the page.
8. **The page.** Five sections, in this order: open tickets, done tickets, merged PRs, open PRs,
   deploys. A source that is `not_configured` says which setting is missing; `unavailable` says it
   could not be reached and when the last good answer was, if any; a `truncated` section says it is
   incomplete. Links open Linear or GitHub in a new tab and say so to a screen reader. A cancelled
   or skipped deploy is shown as such, not as a failure. Usable at 375 px (`admin.phone-console`).

### Acceptance Criteria

#### Tickets with a plain summary (rule 2)
- **Given** Linear answers an open ticket PAD-7 "Atualizar fotos" whose description is
  "**Problema:** as [fotos](https://x) não carregam no iPhone. Passos: …" (300 characters)
- **When** an operator opens `GET /admin/api/work`
- **Then** PAD-7's summary starts "Problema: as fotos não carregam no iPhone." and is at most 200
  characters ending in "…"
- **And** a ticket completed 40 days ago is not in `done`

#### Where a merged PR is (rule 3)
- **Given** PR #10 merged into staging whose merge commit is in `main`, and PR #11 merged into
  staging whose merge commit is not
- **Then** #10 is `production` and #11 is `staging`

#### Not configured (rules 1, 5)
- **Given** no `LINEAR_API_KEY`
- **Then** `linear.status` is `not_configured` and the GitHub part is still answered
- **And** the answer never contains the value of `LINEAR_API_KEY` or `WORK_GITHUB_TOKEN`
- **And** with no `WORK_GITHUB_REPO`, `github.status` is `not_configured` and GitHub is never called

#### A source down (rule 1)
- **Given** GitHub times out
- **Then** `github.status` is `unavailable` and tickets are still answered

#### Who sees it (rule 6)
- **Given** a support token
- **When** it asks for `/admin/api/work`
- **Then** the answer is 403

#### Cached (rule 7)
- **Given** an answer fetched 30 seconds ago
- **When** the page is opened again
- **Then** no outside call is made; `?refresh=1` a minute after the last fetch makes them, but a
  second one within the minute does not, and neither does one right after a cold load

#### More than a page (rules 2–3)
- **Given** a first page of 100 recently updated, unmerged PRs and a merged one on page 2
- **Then** the merged PR is listed

### Notes
- Deferred (proposed v2): TestFlight builds (an App Store Connect key on the server), the bug
  ledger by severity, CI lanes close to their limit, and a "needs owner" view if a Linear label is
  agreed.
- Web only: the staff console has no iOS app (R-024 exception recorded in `admin.foundation`).
