---
name: run-e2e-iterate
description: Run Playwright E2E tests, read failures, fix the implementation, and iterate until tests pass. Use this skill after implementing a ticket to verify the E2E test passes. Triggers when the user says "run tests", "check if tests pass", "iterate on tests", or automatically after implementation in an autonomous ticket workflow.
---

# Run E2E Tests & Iterate

Run the Playwright E2E test for the current ticket and iterate on failures until it passes.

## Steps

1. **Pre-flight: source secrets and kill existing servers:**
   - Source secrets (POSTGRES_PW is required for the test DB):
     ```bash
     source .claude/secrets.env
     ```
   - Kill existing processes on ports 5001 and 8080 (must be separate commands — combined syntax fails on macOS):
     ```bash
     kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
     ```
   - **Why:** If a Vite dev server is already running on port 8080, Playwright reuses it (`reuseExistingServer: !process.env.CI`). That server proxies to port 5000 (dev DB), not 5001 (test DB), causing all tests to fail at login.

2. **Identify the test to run:**
   - Find the E2E test created for this ticket in `e2e/`
   - Look for the ticket ID (e.g. PAD-123) in test file names or describe blocks — older tests may
     still carry the legacy `LVL-` prefix, so search the number too if `PAD-` finds nothing

3. **Make sure the E2E infrastructure starts cleanly:**
   - Playwright config starts its own Flask (port 5001) and Vite (port 8080) servers
   - After the port cleanup in step 1, Playwright will start fresh servers automatically
   - No need to manually start servers — just run the test

4. **Run the specific test:**
   ```bash
   cd levelup_frontend && npx playwright test <test-file> --reporter=list
   ```
   - Run ONLY the ticket-specific test, not the full suite
   - Video is configured in `playwright.config.ts` (`video: "retain-on-failure"`) — no CLI flag needed

5. **If the test passes:**
   - Confirm success
   - Locate the video file in the Playwright output directory (usually `test-results/`)
   - Note the video path — the Stop hook will need it
   - Save the video path to `.claude/last-test-video.txt` so the Stop hook can find it
   - Stop — you're done

6. **If the test fails:**
   - Read the full error output carefully
   - Identify whether the failure is:
     - **Implementation bug**: Your code doesn't do what the test expects → fix the implementation
     - **Test setup issue**: Auth, navigation, or test data problem → fix the test setup (not the assertions)
     - **Timing issue**: Element not yet visible, animation not finished → add appropriate waits
     - **Wrong selector**: Element exists but selector doesn't match → update selector
   - Fix the issue
   - Re-run the test
   - Repeat up to 5 iterations

7. **If still failing after 5 iterations:**
   - Stop iterating
   - Write a summary of:
     - What the test expects
     - What's actually happening
     - What you've tried
     - Your best guess at what's wrong
   - Save this summary — the Stop hook will include it in the Discord notification

8. **Post-test: restart dev servers for Tailscale preview:**
   - E2E tests kill and restart servers on test ports. After tests finish, the dev servers are gone.
   - Restart them so the Tailscale preview works:
     ```bash
     # Restart Vite dev server (proxies to Flask on port 5000)
     cd levelup_frontend && nohup npm run dev > /tmp/vite-ticket.log 2>&1 &
     sleep 3
     # Verify Flask is still running on 5000
     curl -s http://localhost:5000/ > /dev/null 2>&1 || (cd levelup_backend && source .venv/bin/activate && source ../.claude/secrets.env && nohup flask run --host 127.0.0.1 --port 5000 > /tmp/flask-ticket.log 2>&1 &)
     ```

## Important
- NEVER modify test assertions just to make tests pass. Fix the implementation.
- If you realize the original test expectations were wrong (based on how the app actually should work), that's different — you can update the test, but explain why.
- Always keep video recording on — the reporter needs to see the test run.
- Don't run the full test suite, only the ticket-specific test. We don't want to slow things down.
