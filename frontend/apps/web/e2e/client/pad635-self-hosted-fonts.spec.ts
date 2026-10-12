/**
 * PAD-635 (client.route-loading rule 7): Poppins and Plus Jakarta Sans are self-hosted, so no
 * page asks Google for them, before consent or after. Every request the browser makes is
 * recorded (not a list of known Google URLs), so a font request to any foreign origin turns
 * this red. The faces are then loaded by name: a face that was dropped, renamed or still
 * served from Google loads nothing from the page's own origin.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

const GOOGLE_FONT_HOSTS = /(^|\.)fonts\.(googleapis|gstatic)\.com$/;
const FACES = [
  "600 16px Poppins",
  "700 16px Poppins",
  "400 16px 'Plus Jakarta Sans'",
  "500 16px 'Plus Jakarta Sans'",
  "600 16px 'Plus Jakarta Sans'",
  "700 16px 'Plus Jakarta Sans'",
];

function recordRequests(page: Page) {
  const urls: string[] = [];
  page.context().on("request", (r) => {
    if (/^https?:/.test(r.url())) urls.push(r.url());
  });
  return urls;
}

/** Each face loads at least one font file, and every font file comes from the page's own origin. */
async function expectFacesSelfHosted(page: Page, urls: string[], where: string) {
  const loaded = await page.evaluate(async (faces) => {
    const out: Record<string, number> = {};
    for (const face of faces) out[face] = (await document.fonts.load(face)).length;
    return out;
  }, FACES);
  for (const face of FACES) expect(loaded[face], `${face} on ${where}`).toBeGreaterThan(0);

  const own = new URL(page.url()).origin;
  const fontFiles = urls.filter((u) => /\.woff2?$/.test(new URL(u).pathname));
  expect(fontFiles.length, `font files on ${where}`).toBeGreaterThan(0);
  expect(fontFiles.filter((u) => new URL(u).origin !== own), `foreign font files on ${where}`).toEqual([]);
  expect(urls.filter((u) => GOOGLE_FONT_HOSTS.test(new URL(u).hostname)), `Google font requests on ${where}`).toEqual([]);

  // The CSS still names the same families, so the rendering is unchanged.
  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(body, `body font on ${where}`).toMatch(/^"?Plus Jakarta Sans"?,/);
}

test.describe("self-hosted fonts (PAD-635)", () => {
  test("PAD-635: public pages ask Google for no font, before any consent", async ({ page }) => {
    const urls = recordRequests(page);
    for (const path of ["/", "/auth"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectFacesSelfHosted(page, urls, path);
    }
  });

  test("PAD-635: signed-in pages ask Google for no font", async ({ page }) => {
    const urls = recordRequests(page);
    await loginAsCoach(page);
    for (const path of ["/dashboard", "/calendar"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectFacesSelfHosted(page, urls, path);
    }
  });
});
