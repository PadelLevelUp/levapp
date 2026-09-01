import { test, expect } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";

/**
 * The public landing page at `/`, and the animated loader that covers the
 * handoff from the login form to the app.
 *
 * The whole suite runs under `reducedMotion: "reduce"` (playwright.config.ts),
 * so the mark skips straight to its finished frame. The overlay still mounts,
 * holds and reveals — which is the behaviour these tests are about — it just
 * doesn't spend 1.6s drawing itself first.
 *
 * Pre-auth pages render in the default locale (pt), so the logged-out
 * assertions below use pt copy and stable ids, never English.
 */

test.describe("landing page", () => {
  test("a visitor with no session gets the landing page at /", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /enche as aulas/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    // The public page must never leak the app shell.
    await expect(page.getByRole("link", { name: /^calendário$/i })).toHaveCount(0);
  });

  test("the landing page's Entrar button goes to the login form", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^entrar$/i }).first().click();

    await page.waitForURL("**/auth");
    await expect(page.locator("#username")).toBeVisible();
  });

  test("a signed-in user gets the dashboard at /, not the landing page", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /enche as aulas/i }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: /^(calendar|calendário)$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the footer links reach the legal pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^privacidade$/i }).click();
    await page.waitForURL("**/privacy");

    await page.goto("/");
    await page.getByRole("link", { name: /^termos$/i }).click();
    await page.waitForURL("**/terms");
  });
});

test.describe("login loader", () => {
  test("the loader covers the login and hands off to the dashboard", async ({
    page,
  }) => {
    // Hold the login response open so the overlay is provably on screen while
    // we assert, instead of racing a warm local backend that answers in 20ms.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/login", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/auth");
    await page.locator("#username").fill(COACH_USERNAME);
    await page.locator("#password").fill(COACH_PASSWORD);
    await page.locator('button[type="submit"]').click();

    const loader = page.getByTestId("launch-loader");
    await expect(loader).toBeVisible();
    // It must never eat clicks meant for the app mounting behind it.
    await expect(loader).toHaveCSS("pointer-events", "none");

    release();

    // The overlay unmounts itself once the reveal has played...
    await expect(loader).toHaveCount(0, { timeout: 15_000 });
    // ...onto the app, not back onto the login form.
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: /^(calendar|calendário)$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("a failed login takes the loader away so the error is readable", async ({
    page,
  }) => {
    await page.goto("/auth");
    await page.locator("#username").fill(COACH_USERNAME);
    await page.locator("#password").fill("WrongPassword!");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("launch-loader")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/auth/);
    await expect(
      page
        .locator("text=/invalid|incorrect|inválid|palavra-passe/i")
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

/**
 * The reveal flies the mark onto the app's own logo. These lock in the two
 * things that would regress silently: the flight actually running (a missed
 * target falls back to a plain fade, which looks exactly like the feature not
 * being wired up), and where it lands (redrawing either brand asset moves the
 * mark inside it and the loader's insets would go stale).
 */
test.describe("login loader reveal", () => {
  /** Mirrors LOGO_INSETS in components/brand/launch-loader.tsx. */
  const INSETS = {
    lockup: { left: 0, top: 20 / 140, width: 146.88 / 546, height: 99.98 / 140 },
    mark: { left: 27 / 718, top: 27 / 506, width: 664 / 718, height: 452 / 506 },
  };

  async function submitLogin(page: import("@playwright/test").Page) {
    await page.goto("/auth");
    await page.locator("#username").fill(COACH_USERNAME);
    await page.locator("#password").fill(COACH_PASSWORD);
    await page.locator('button[type="submit"]').click();
    return page.getByTestId("launch-loader");
  }

  for (const [name, width, height] of [
    ["desktop, onto the sidebar lockup", 1440, 900],
    ["mobile, onto the header mark", 390, 844],
  ] as const) {
    test(`the mark lands on the app logo — ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const loader = await submitLogin(page);
      await loader.waitFor();
      await expect(loader).toHaveAttribute("data-reveal", "fly", { timeout: 15_000 });

      // The last rect before the overlay unmounts is where the mark landed.
      const landed = await page.evaluate(
        () =>
          new Promise<{ y: number; x: number; w: number; h: number } | null>((resolve) => {
            let last: { y: number; x: number; w: number; h: number } | null = null;
            const tick = () => {
              const el = document.querySelector('[data-testid="launch-loader"]');
              if (!el) return resolve(last);
              const g = el.querySelector("g");
              if (g) {
                const r = g.getBoundingClientRect();
                last = { x: r.left, y: r.top, w: r.width, h: r.height };
              }
              requestAnimationFrame(tick);
            };
            tick();
          }),
      );

      const target = await page.evaluate((insets) => {
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>("[data-launch-logo]"),
        )) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const i =
            el.dataset.launchLogo === "lockup" ? insets.lockup : insets.mark;
          return {
            x: r.left + i.left * r.width,
            y: r.top + i.top * r.height,
            w: i.width * r.width,
            h: i.height * r.height,
          };
        }
        return null;
      }, INSETS);

      expect(landed).not.toBeNull();
      expect(target).not.toBeNull();
      expect(
        Math.abs(landed!.x + landed!.w / 2 - (target!.x + target!.w / 2)),
      ).toBeLessThan(2);
      expect(
        Math.abs(landed!.y + landed!.h / 2 - (target!.y + target!.h / 2)),
      ).toBeLessThan(2);
      // Fitted by height, so this is the one that must be tight.
      expect(Math.abs(landed!.h - target!.h)).toBeLessThan(1.5);
    });
  }

  test("with no logo on screen it falls back to a fade", async ({ page }) => {
    // Between `sm` (640) and `md` (768) the sidebar is still hidden and the
    // mobile header mark is already hidden, so there is nothing to fly to.
    await page.setViewportSize({ width: 700, height: 900 });
    const loader = await submitLogin(page);
    await loader.waitFor();
    await expect(loader).toHaveAttribute("data-reveal", "fade", { timeout: 15_000 });
    await expect(loader).toHaveCount(0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("reduced motion does not fly the mark across the screen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    const loader = await submitLogin(page);
    await loader.waitFor();
    await expect(loader).toHaveAttribute("data-reveal", "fade", { timeout: 15_000 });
  });
});
