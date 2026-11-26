import { test, expect, type Page } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";

/**
 * auth.invite-welcome rule 6 (AUTH-INVITE-WELCOME-4): the navy band fits a phone and both themes: the signed-in join
 * preview with the club's logo, a long unbroken coach's name and club, and the longest invite forms, at 320px and
 * 1280px, light and dark. The previews are answered by the test (the pages read only them).
 * Pre-auth pages render in the default locale (pt): ids and sizes, never copy.
 */

const LONG = "Maria-Antonieta-de-Albuquerque-e-Castelo-Branco-Vasconcelos";
// A 1x1 transparent png: the club's logo, as an address the page draws.
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function answerPreviews(page: Page) {
  await page.route("**/api/app/join-tokens/tok-join", (route) =>
    route.fulfill({ json: { coachName: LONG, clubName: `Clube-${LONG}`, clubLogoUrl: LOGO } })
  );
  await page.route("**/api/app/coach-invitations/tok-coach", (route) =>
    route.fulfill({ json: { clubName: `Clube-${LONG}`, status: "pending" } })
  );
  await page.route("**/api/app/player-invitations/tok-player", (route) =>
    route.fulfill({ json: { playerName: LONG, status: "pending" } })
  );
}

/** Straight-alpha rgba of a computed colour, composited over an opaque background, as [r, g, b]. */
const parse = (css: string): number[] => (css.match(/[\d.]+/g) ?? []).map(Number);
const over = (fg: number[], bg: number[]) => {
  const a = fg.length > 3 ? fg[3] : 1;
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
};
const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: number[], b: number[]) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// The signed-out pages first: signing in turns the player page into its claim state.
const PAGES = [
  { name: "the coach invitation", path: "/invite/coach/tok-coach", signedIn: false, primary: "form button[type=submit]" },
  { name: "the player invitation", path: "/invite/player/tok-player", signedIn: false, primary: "form button[type=submit]" },
  { name: "the signed-in join preview", path: "/join/coach/tok-join", signedIn: true, primary: "[data-testid=join-coach-confirm]" },
];

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 1280]) {
    test(`[AUTH-INVITE-WELCOME-4] the band fits a phone and both themes (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          /* no storage */
        }
      }, theme);
      await answerPreviews(page);

      for (const p of PAGES) {
        if (p.signedIn) await loginAsStudent(page);
        await page.goto(p.path);
        const band = page.getByTestId("invite-band");
        await expect(band, p.name).toBeVisible();

        // Nothing scrolls sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${p.name} scrolls sideways`).toBeLessThanOrEqual(0);

        // The band's text has a contrast of 4.5:1 with the band, the text's own alpha composited over it.
        const colours = await band.evaluate((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          const texts = Array.from(el.querySelectorAll("h3, p")).map((n) => getComputedStyle(n).color);
          return { bg, texts };
        });
        expect(colours.texts.length, `${p.name} has text on the band`).toBeGreaterThan(0);
        const bg = parse(colours.bg).slice(0, 3);
        for (const c of colours.texts) expect(contrast(over(parse(c), bg), bg), `${p.name} ${c}`).toBeGreaterThanOrEqual(4.5);

        // In dark the band is told from the page by the sidebar-border hairline: a real width, in the token's colour.
        const border = await band.evaluate((el) => {
          const probe = document.createElement("span");
          probe.style.borderStyle = "solid";
          probe.style.borderWidth = "1px";
          probe.style.borderColor = "hsl(var(--sidebar-border))";
          document.body.appendChild(probe);
          const token = getComputedStyle(probe).borderTopColor;
          probe.remove();
          const cs = getComputedStyle(el);
          return { width: cs.borderBottomWidth, style: cs.borderBottomStyle, color: cs.borderBottomColor, token };
        });
        if (theme === "dark") {
          expect(border.style).toBe("solid");
          expect(parseFloat(border.width)).toBeGreaterThanOrEqual(1);
          expect(border.color).toBe(border.token);
        }

        // The join preview draws the club's logo; its names wrap.
        if (p.signedIn) await expect(band.locator("img:not([alt='LevApp'])")).toHaveCount(1);

        // The primary action is at least 44px high, and the form can be completed: its last control is reachable.
        const primary = page.locator(p.primary);
        expect(await primary.count(), `${p.name} has its primary action`).toBe(1);
        await primary.scrollIntoViewIfNeeded();
        await expect(primary).toBeVisible();
        await expect(primary).toBeEnabled();
        expect((await primary.boundingBox())!.height, `${p.name} primary height`).toBeGreaterThanOrEqual(44);
        if (!p.signedIn) {
          for (const id of ["username", "password"]) {
            const field = page.locator(`#${id}`);
            await field.scrollIntoViewIfNeeded();
            await field.fill("tester_one");
            await expect(field).toHaveValue("tester_one");
          }
        }
      }
    });
  }
}
