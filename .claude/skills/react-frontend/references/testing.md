# Testing

## Unit / Component Tests (Vitest + RTL)

### Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

### Component Test

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerCard } from "./PlayerCard";

const mockPlayer = { id: "1", name: "John Doe", email: "john@example.com" };

test("calls onSelect when clicked", async () => {
  const onSelect = vi.fn();
  render(<PlayerCard player={mockPlayer} onSelect={onSelect} />);

  await userEvent.click(screen.getByText("John Doe"));
  expect(onSelect).toHaveBeenCalledWith("1");
});

test("displays player name", () => {
  render(<PlayerCard player={mockPlayer} onSelect={vi.fn()} />);
  expect(screen.getByText("John Doe")).toBeInTheDocument();
});
```

### Testing Hooks

```typescript
import { renderHook, act } from "@testing-library/react";
import { useCounter } from "./useCounter";

test("increments counter", () => {
  const { result } = renderHook(() => useCounter());

  act(() => result.current.increment());

  expect(result.current.count).toBe(1);
});
```

## E2E Tests (Playwright)

### Locator Strategy

Prefer accessibility-based locators:

```typescript
// GOOD: Role-based
page.getByRole("button", { name: /save/i });
page.getByRole("textbox", { name: /email/i });
page.getByLabel("Name");
page.getByPlaceholder("Search...");

// AVOID: CSS selectors
page.locator(".btn-primary");
page.locator("#submit-btn");
```

### Test Structure

```typescript
test.describe("Player Management", () => {
  test.beforeEach(async ({ page }) => {
    // Seed test data
    // Login
    // Navigate to page
  });

  test("can create a player", async ({ page }) => {
    await page.getByRole("button", { name: /add player/i }).click();
    await page.getByPlaceholder("e.g. John Doe").fill("New Player");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("New Player")).toBeVisible();
  });
});
```

### Rules

- Add `aria-label` to elements that need testability
- Seed test data before each suite — don't depend on prior test state
- Don't share state between tests
- Use `test.describe` for grouping related tests

## What to Test per Layer

| Layer | What to test | Tool |
|-------|-------------|------|
| Utils | Pure logic, edge cases | Vitest |
| Hooks | State transitions, effect behavior | Vitest + renderHook |
| Components | User interactions, conditional rendering | Vitest + RTL |
| Pages | Integration with API (mock at network level) | Vitest + RTL + MSW |
| E2E | Critical user flows end-to-end | Playwright |
