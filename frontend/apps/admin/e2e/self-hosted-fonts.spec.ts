import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// PAD-635 (admin.foundation rule 12a): the console's fonts are self-hosted. Every request is
// recorded, so a font file from any foreign origin, or any request to Google's font hosts,
// turns this red; the faces are loaded by name to prove they resolve from the console itself.
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

  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(body, `body font on ${where}`).toMatch(/^"?Plus Jakarta Sans"?,/);
}

test.describe("self-hosted fonts", () => {
  test("PAD-635: the sign-in page asks Google for no font", async ({ page }) => {
    const urls = recordRequests(page);
    await page.goto("/");
    await expect(page.getByTestId("admin-sign-in")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectFacesSelfHosted(page, urls, "/");
  });

  test("PAD-635: a signed-in page asks Google for no font", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    const urls = recordRequests(page);
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await expectFacesSelfHosted(page, urls, "/users");
  });
});
