---
id: admin.work-dashboard
status: implementing
depends_on: [admin.foundation]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-024, R-036]
---

# admin.work-dashboard

> Linear: PAD-555 (owner request 2026-10-08). Scope proposed 2026-10-12; the owner confirmed it the
> same day: plain-text excerpt summaries (no AI), owner and operator only, TestFlight in a v2.
> v2 (PAD-646, wave 16, scope from the coordinator 2026-10-21): TestFlight builds, the bug ledger and
> CI lane timing (rules 9–11). The "needs owner" view stays out until a Linear label is agreed.

### Intent
The owner wants one page in the staff console that says what is left to do, what was done and what
has shipped, without opening Linear and GitHub. Read-only. The data comes from Linear and GitHub
through the backend; their tokens never reach the browser.

### Entities
- **READS:** nothing in LevApp's database. Linear issues (team `PAD`) and the GitHub repository's
  pull requests, commits on `main` and the two deploy workflows' runs, over their HTTP APIs; the
  bug ledger index and the CI workflows' runs, jobs and files on GitHub; the app's builds on App
  Store Connect.
- **WRITES:** nothing.

### Rules
1. **One endpoint.** `GET /admin/api/work` answers `{fetchedAt, linear, github, testflight, bugs, ci}`. Each source is
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
8. **The page.** Sections in this order: open tickets, done tickets, merged PRs, open PRs,
   deploys, TestFlight builds, open bugs, CI lanes. A source that is `not_configured` says which setting is missing; `unavailable` says it
   could not be reached and when the last good answer was, if any; a `truncated` section says it is
   incomplete. Links open Linear or GitHub in a new tab and say so to a screen reader. A cancelled
   or skipped deploy is shown as such, not as a failure. Usable at 375 px (`admin.phone-console`).

9. **TestFlight builds (App Store Connect, PAD-646).** With `ASC_KEY_ID`, `ASC_ISSUER_ID`,
   `ASC_PRIVATE_KEY` (the `.p8` key's PEM text, a secret) and `ASC_APP_ID` all set, the backend
   signs a 20-minute ES256 token (`aud` `appstoreconnect-v1`) and reads the app's 10 most recently
   uploaded builds: build number, app version, `uploadedAt`, processing state, expired, the internal
   and external TestFlight states, and "What to Test" (the first localization's `whatsNew`, plain
   text, at most 200 characters) as what changed. Until all four are set, `testflight` is
   `not_configured` naming the first missing one (the owner provisions the key in App Store Connect →
   Users and Access → Integrations, role Developer). The key and the token never leave the server.
10. **Open bugs (the ledger, PAD-646).** With `WORK_GITHUB_REPO` set, the ledger index
   `.cortex/compass/bugs/_index.md` on `staging` is read through GitHub's contents API (one call).
   Each line `- [B-NNN](file) — title (type, severity, status…)` is a bug. `open` lists those whose
   status is neither `resolved` nor `wontfix` nor `duplicate`, grouped by severity (critical, high,
   medium, low, then anything else), each with id, title, type, status and its GitHub url;
   `counts` gives open per severity and the resolved total. A line that does not parse is counted
   in `unparsed`, never dropped silently.
11. **CI lanes (PAD-646).** Needs `WORK_GITHUB_TOKEN` (about 30 calls a refresh, more than the
   anonymous allowance): without it `ci` is `not_configured`. For each CI workflow
   (`backend-tests.yaml`, `checks-frontend.yaml`, `e2e-subset.yaml`, `admin-e2e.yaml`,
   `android-build.yaml`), the last 10 completed runs give the failure rate (`failure` or
   `timed_out` over the runs that were not cancelled or skipped), and the jobs of the last 5 give
   each lane's latest, median and longest minutes. A lane's `timeoutMinutes` is read from the
   workflow file on `staging` (its job's `timeout-minutes`; GitHub's 360 when unset); `nearLimit` is
   true when its longest run reached 80 % of it. Matrix jobs ("pytest (postgres, … group 1/2)")
   are one lane per job name.

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

#### TestFlight not configured, then configured (rule 9)
- **Given** no `ASC_KEY_ID` **Then** `testflight` is `not_configured` with `missing: "ASC_KEY_ID"`
  and App Store Connect is never called
- **Given** all four settings and App Store Connect answering build 34 (1.3.2, uploaded
  2026-10-20, valid, internal "IN_BETA_TESTING", What to Test "Som das notificações")
- **Then** the build is listed with those fields, the request carried a Bearer token signed ES256
  for `appstoreconnect-v1`, and the answer contains neither the key nor the token

#### Open bugs by severity (rule 10)
- **Given** an index with B-1 (high, open), B-2 (low, triaged), B-3 (high, resolved in PAD-9) and a
  line without a parenthesis
- **Then** `open` is B-1 then B-2, `counts` is high 1 / low 1 / resolved 1, and `unparsed` is 1

#### CI lanes near their limit (rule 11)
- **Given** the token, a `backend-tests.yaml` whose sqlite job has `timeout-minutes: 60`, and its
  last 5 runs' sqlite job taking 30, 31, 40, 49 and 50 minutes
- **Then** the lane shows latest 30, median 40, longest 50, `nearLimit` true; with no token `ci` is
  `not_configured` and GitHub's Actions API is never called

### Notes
- Shipped in v2 (PAD-646): TestFlight builds, the bug ledger by severity, CI lanes close to their
  limit. Still out: a "needs owner" view until a Linear label is agreed.
- TestFlight "target (staging or production)" from the ticket is not shown: the app has one bundle
  and builds carry no environment; "what changed" is the build's own What to Test text.
- Web only: the staff console has no iOS app (R-024 exception recorded in `admin.foundation`).
