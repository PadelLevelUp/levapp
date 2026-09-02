# Conflict playbook

Read this the first time a merge into staging conflicts.

## The autonomy line

Resolve it yourself when the conflict is **mechanical** — where both sides are
independently correct and the merge is a matter of combining them, with only one
sensible answer. Lockfiles, migration chains, translation catalogues, import lists,
route registration blocks: two PRs each appended an entry, git couldn't tell that both
belong.

Stop and ask when the conflict is **semantic** — where the two changes disagree about
what the code should do. Two PRs rewriting the same function body, one adding a
validation the other deliberately removes, competing refactors of the same module. The
tell is that you'd be choosing behaviour rather than combining additions. Guessing there
produces code that compiles, passes tests, and does the wrong thing — the worst possible
failure mode, because nothing catches it.

When you do ask, be concrete and cheap to answer: name both PRs, show the two versions,
say what each was trying to achieve, and recommend one. Don't dump the raw conflict
markers and ask "what should I do".

## Lockfiles — never hand-merge

`poetry.lock` and `package-lock.json` conflict between almost any pair of dependency-
touching PRs. A hand-merged lockfile is often *syntactically* fine and semantically
broken, and CI catches it only at deploy time (`poetry check --lock` / `npm ci`), after
which nothing ships.

Always discard both sides and regenerate from the merged manifest:

```bash
# backend
git checkout --ours poetry.lock && poetry lock && poetry check --lock && git add poetry.lock

# frontend — full clean regenerate; --package-lock-only is unreliable in this monorepo
rm -rf node_modules package-lock.json && npm install
npm ci --dry-run    # must print no "Missing:" or "Invalid:" lines
git add package-lock.json
```

If `pyproject.toml` or `package.json` *itself* conflicts, that part is usually mechanical
— two PRs each added a dependency line. Keep both, then regenerate the lock. Only if
they pin *the same package to different versions* is it a real decision: take the higher
version, verify it satisfies both PRs' needs, and mention it in the report.

## Alembic migrations

Migration files themselves rarely conflict textually — each PR adds a new file. The
conflict is structural: two new revisions both claiming the same `down_revision`, giving
you two heads. Step 3 of the workflow handles that with a merge revision; don't try to
fix it by rewriting `down_revision` to chain the migrations manually. Rewriting the chain
changes revisions that may already be applied in other environments, and Alembic's merge
revision exists precisely for this.

If two PRs add migrations that alter *the same column*, that's semantic — ask.

## Translation catalogues (`src/locales/{pt,en}/*.json`)

Two PRs adding different keys to the same JSON file is mechanical: keep both key sets,
fix the trailing-comma damage git leaves behind, and confirm the file parses
(`python3 -m json.tool <file> > /dev/null`).

Watch for one thing: the two locales must stay in sync. If PR A added `foo.bar` to both
`pt` and `en` and the conflict resolution drops it from one, the app falls back and
shows an English string in a Portuguese UI. After resolving any locale conflict, diff
the key sets of `pt` and `en` for the touched namespace and confirm they match.

## Import blocks, route registration, barrel files

Both sides appended a line to a list. Keep both, in whatever order the file's existing
convention suggests (usually alphabetical). Verify by building — `npm run build` for the
frontend, `python -c "import padel_app"` for the backend — rather than by eye; a dropped
import in a file you didn't otherwise touch is easy to miss.

## Test files

Two PRs adding different test cases to the same spec file: keep both. That's the common
case and it's mechanical.

Two PRs modifying the *same* test's assertions is semantic — they disagree about the
expected behaviour, which means the underlying implementations probably disagree too.
Ask, and flag that the disagreement likely extends beyond the test.

## After every resolution

Record it in one line — which file, which two PRs, what you did — for the closing
summary. If something breaks in prod three days later, that list is the first place
anyone will look, and "resolved conflicts in 6 files" is not a useful record.

## When a ticket is simply too tangled

Some tickets will conflict deeply with something else in the batch. Don't fight it and
don't stop to ask: `git merge --abort`, leave that ticket's PRs open, drop both halves
if it's cross-repo, carry on with the rest, and note it in the closing summary. Landing
15 of 17 tickets is a good outcome; a bad merge that reaches production is not, and a
ticket left open for its author to rebase costs almost nothing.
