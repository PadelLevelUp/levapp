---
name: write-e2e-test
description: Write a Playwright E2E test for a ticket before implementing the change (TDD). Use this skill whenever starting work on a ticket, before writing any implementation code. Triggers on ticket implementation workflows, when the user says "write e2e test", "create test for this ticket", or at the start of any autonomous ticket workflow.
---

# Write E2E Test

Write a Playwright E2E test that verifies the ticket's expected behavior. This test should FAIL initially — it defines what "done" looks like.

## Steps

1. **Pre-flight: source secrets and kill existing servers:**
   ```bash
   source .claude/secrets.env
   kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
   ```
   **Why:** `POSTGRES_PW` is required for the test DB. A running Vite dev server on 8080 proxies to port 5000 (dev DB). Playwright reuses it instead of starting one for tests (port 5001), causing auth failures. On macOS, combined lsof port syntax (`:5001,:8080`) doesn't work — kill ports separately.

2. **Read the ticket description** from the current prompt. Identify:
   - What the user should be able to do (for features)
   - What currently goes wrong and what correct behavior looks like (for bugs)
   - Which pages/components are involved

3. **Check existing E2E tests** to understand patterns:
   - Read 2-3 test files in `e2e/` to learn the project's Playwright conventions
   - Note: how pages are navigated, how auth is handled, how selectors are chosen, any test utilities or fixtures used

4. **Decide where the test goes:**
   - All tests must go in `levelup_frontend/apps/web/e2e/` (Playwright's `testDir: "./e2e"`, resolved from `apps/web/` where the only `playwright.config.ts` lives — tests outside this dir won't be found)
   - If it's a **permanent regression test** → add to an existing or new spec file in the appropriate `e2e/<feature>/` folder
   - If it's **ticket-specific** and not valuable as regression → still put in `e2e/`, but tag the test with `@ticket-only` in the title so it can be excluded from the main suite:
     ```typescript
     test('PAD-123 @ticket-only: specific scenario', async ({ page }) => { ... });
     ```

5. **Write the test:**
   - Use `test.describe` with the ticket ID in the description
   - Write clear test names that describe the expected behavior
   - **Locator priority:** `getByRole` > `getByPlaceholder` > `getByLabel` > `getByText` > CSS class (last resort)
   - Include setup steps (login, navigate to page, create test data if needed)
   - Assert the expected outcome
   - Keep it focused — one test per distinct behavior, but multiple assertions are fine

6. **Enable video recording** for the test:
   - Make sure the test project config or the test itself has `video: 'on'` so we capture a recording
   - If the global config already records video, no changes needed — just confirm it

7. **Run the test once** to confirm it fails for the right reason (the feature doesn't exist yet or the bug still reproduces). If it fails for a setup/infrastructure reason, fix that first.

## Important Patterns

### API Endpoints
All frontend API calls use **POST** to `/app/*` endpoints (e.g. `/app/edit_player`, `/app/add_class`), NOT RESTful routes like `PUT /api/players/:id`. If your test intercepts API routes, match `/app/*` patterns.

### Locator Gotchas
- `getByText("E2E Student")` matches both "E2E Student" and "E2E Student Two" — use `{ exact: true }`
- Player name input: use `getByPlaceholder("e.g. John Doe")` (avoid `/name/i` which matches "Username")
- AddClassSheet name input has no label — use `getByPlaceholder("e.g. Beginner Academy")` not `getByRole("textbox", { name: /name/i })`
- PlayerDetailPage uses inline editing (no dialog) — clicking "Edit" enters edit mode directly on the page

### Frontend Caching
`src/api/players.ts` has a client-side cache with 60s TTL. Any mutation affecting players must call `invalidateCoachPlayersCache()` or the Players page shows stale data.

## Example structure

```typescript
import { test, expect } from '@playwright/test';
import { loginAsCoach } from '../helpers/auth';
import { openPlayers } from '../helpers/navigation';

test.describe('PAD-123: Registration form second phone number', () => {
  test('should allow adding a second phone number without crashing', async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
    
    // Navigate to add player
    await page.getByRole('button', { name: /add player/i }).click();
    
    // Fill player details
    await page.getByPlaceholder('e.g. John Doe').fill('Test Player');
    await page.getByPlaceholder('+351').first().fill('+351912345678');
    
    // Add second phone number
    await page.getByRole('button', { name: /add phone/i }).click();
    await page.getByPlaceholder('+351').last().fill('+351987654321');
    
    // Submit should succeed
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('Player created')).toBeVisible();
  });
});
```
