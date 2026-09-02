---
name: open-pr
description: Open a pull request on GitHub for the current branch, linking it to the Linear ticket. Only use when the user explicitly says "/open-pr" or "open a PR" or "create a pull request". This is a human-triggered step after review approval.
---

# Open Pull Request

Open a PR on GitHub for the current feature branch. This is triggered manually after human review.

## Steps

1. **Extract ticket info from the branch name:**
   - Branch format: `feature/pad-<id>-<slug>` (e.g. `feature/pad-113-reminder-transaction-fix`) →
     ticket ID is `PAD-113`
   - Legacy branches from the older naming era still exist — accept `feature/lvl-<id>` and
     `feature/lvl-pad-<id>` too. Take the trailing number (so `feature/lvl-pad-93` → `93`,
     `feature/lvl-51` → `51`). For `lvl-pad-` branches the ID is `PAD-<n>`; for bare `lvl-`
     branches confirm against Linear before linking, since the ticket may predate the PAD prefix
   - If the branch doesn't follow any of these formats, ask for the ticket ID

2. **Stage and commit any uncommitted changes:**
   ```bash
   git add -A
   git status
   ```
   - If there are uncommitted changes, commit with a conventional commit message:
     - Bug: `fix(PAD-123): brief description of the fix`
     - Feature: `feat(PAD-123): brief description of the feature`
     - Improvement: `refactor(PAD-123): brief description`
   - If everything is already committed, skip this step

3. **Push the branch:**
   ```bash
   git push -u origin HEAD
   ```

4. **Create the PR with `gh`:**
   ```bash
   gh pr create \
     --title "PAD-123: Title from the ticket" \
     --body "PR body (see below)" \
     --base main
   ```

   **PR body template:**
   ```
   ## Ticket
   [PAD-123](linear-ticket-url)

   ## What changed
   Brief description of what was implemented or fixed.

   ## Files changed
   - List of key files and what changed in each

   ## Testing
   - E2E test: `path/to/test.spec.ts`
   - Manual testing: describe what to check

   ## Screenshots / Video
   E2E test recording was shared in the Discord review thread.
   ```

5. **Print the PR URL** so the user can share it.

6. **Stop Tailscale serving** (cleanup):
   ```bash
   tailscale serve --remove / 2>/dev/null || true
   ```
