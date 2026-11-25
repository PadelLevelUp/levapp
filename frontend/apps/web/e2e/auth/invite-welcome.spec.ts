import { test, expect, type Page } from "@playwright/test";

/**
 * auth.invite-welcome rule 6 (AUTH-INVITE-WELCOME-4): the navy band fits a phone and both themes. The three public
 * previews are answered by the test (the pages read only them), with a long unbroken coach's name and club.
 * Pre-auth pages render in the default locale (pt): ids and sizes, never copy.
 */

const LONG = "Maria-Antonieta-de-Albuquerque-e-Castelo-Branco-Vasconcelos";

async function answerPreviews(page: Page) {
  await page.route("**/api/app/join-tokens/tok-join", (route) =>
    route.fulfill({ json: { coachName: LONG, clubName: `Clube-${LONG}`, clubLogoUrl: null } })
  );
  await page.route("**/api/**/invitations/**", (route) => route.fulfill({ json: { clubName: LONG, playerName: LONG } }));
}

/** WCAG relative luminance of a computed `rgb(a)` colour. */
const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const rgb = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 1280]) {
    test(`the band fits a phone and both themes (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          /* no storage */
        }
        document.documentElement.classList.toggle("dark", t === "dark");
      }, theme);
      await answerPreviews(page);

      for (const path of ["/join/coach/tok-join", "/invite/coach/tok-coach", "/invite/player/tok-player"]) {
        await page.goto(path);
        const band = page.getByTestId("invite-band");
        await expect(band).toBeVisible();

        // Nothing scrolls sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);

        // The band's text has a contrast of 4.5:1 with the band.
        const colours = await band.evaluate((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          const texts = Array.from(el.querySelectorAll("h3, p")).map((n) => getComputedStyle(n).color);
          return { bg, texts, border: getComputedStyle(el).borderBottomColor };
        });
        for (const c of colours.texts) expect(contrast(c, colours.bg)).toBeGreaterThanOrEqual(4.5);
        // In dark the band is told from the page by a hairline.
        if (theme === "dark") expect(colours.border).not.toBe("rgba(0, 0, 0, 0)");

        // The primary action is at least 44px high.
        const primary = page.locator("button[type=submit], [data-testid=join-coach-create-account]").first();
        if (await primary.count()) expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
}
