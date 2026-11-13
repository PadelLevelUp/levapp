---
id: delivery.pre-push-gate
status: implemented
depends_on: []
serves: [P-DELIVERY-4]
---

# delivery.pre-push-gate

### Intent
`git push` runs `.githooks/prepush-gate.sh`, which runs CI's own commands on what changed so a red
is caught before CI emails the owner (PAD-720). A gate that tests on a Node CI never uses reports
reds and greens CI will not see. On 2026-11-12 it ran `npm test` on Node 26, which breaks the jsdom
tests (PAD-930).

### Entities
- **`.githooks/prepush-gate.sh`**: the gate. Its frontend step is the one this spec constrains.
- **`.nvmrc`** (repo root): the Node version the frontend checks run on, the version CI runs
  (`checks-frontend.yaml`, `node-version`).

### Rules
1. **The frontend checks run on the pinned Node.** When `frontend/` changed, the gate runs `tsc` and
   `npm test` only on the version in `.nvmrc` (24.15.0). When nvm is present it switches to that
   version itself.
2. **No substitute.** If that version cannot be put first on `PATH`, the gate runs none of the
   frontend checks, names the active version and its path, prints the fix (`nvm install <version>`),
   and fails. A Node 25 or newer is never accepted. Another 24.x is accepted with a note.
3. **The gate says which Node it used** on the line before the frontend steps.
4. **A changed spec is validated.** When a push changes a file under `specflow/` other than the
   generated `INDEX.md`, and `cortex` is on `PATH`, the gate runs `cortex validate` and fails if
   it reports an error naming one of those files. Errors in files the push did not change do not
   fail it.

### Not this spec
- Which other files trigger which check, and the backend and cortex store checks.
- The `[skip-prepush: <reason>]` escape hatch (see `.githooks/README.md`).

### Acceptance Criteria

#### DELIVERY-PREPUSH-1: Node 25 or newer is refused, 24.15.0 is used
- **Given** a push that changes `frontend/`, and no Node 24 reachable with nvm
- **When** the gate runs with Node 26 first on `PATH`
- **Then** no `tsc` or `npm test` step runs, the output names `v26` and its path and the install
  line, and the gate exits non-zero; with `~/.nvm/versions/node/v24.15.0/bin` first it prints
  `frontend checks on node v24.15.0` and runs the steps

#### DELIVERY-PREPUSH-2: A missing pinned version under nvm fails loudly
- **Given** nvm is present and the `.nvmrc` version is not installed
- **When** the gate runs for a `frontend/` change
- **Then** it names the missing version, prints `nvm install <version>`, runs no frontend step and
  exits non-zero

#### DELIVERY-PREPUSH-3: A changed spec is validated
- **Given** a push that changes a file under `specflow/` (not `INDEX.md`), and `cortex` on `PATH`
- **When** the gate runs
- **Then** a `cortex validate (changed files)` step runs, and a validation error naming that file
  fails the gate and names the file; a push that changes only `specflow/INDEX.md` runs no such step

### Open questions
- Should CI read `.nvmrc` (`node-version-file`) so the two cannot drift? Not in this change.
