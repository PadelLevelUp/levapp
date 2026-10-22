import { test, expect } from "@playwright/test";
import { expectFitsViewport } from "./widths";
import { captureRelay, fillDemoForm, settle, stubHubSpot, trackerRuns, trackingCookies, watchForeign } from "./public-site";

/**
 * PAD-656 — /contacto (auth.landing-page): the site's one contact form on a page of its own,
 * inside the site frame. It sends no `pedido`; HubSpot tells it from a demo request by the missing
 * `levapp_pedido_site` and the `pageUri` (the page's URL, ending /contacto). The API is
 * route-stubbed, like the consent spec's; the real E2E backend has no form id and would answer 503.
 */

for (const width of [390, 1280]) {
  test.describe(`/contacto at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 700 ? 844 : 800 } });

    test(`PAD-656: shows the site frame and the form, and nothing sticks out (${width})`, async ({ page }) => {
      await page.goto("/contacto");
      await expect(page.getByTestId("site")).toBeVisible();
      const contact = page.getByTestId("contact-page");
      await expect(contact).toBeVisible();
      await expect(contact.getByTestId("demo-firstname")).toBeVisible();
      await expect(contact.getByTestId("demo-submit")).toBeVisible();
      // The form lives on the page, not in a dialog.
      await expect(page.getByTestId("demo-dialog")).toHaveCount(0);
      await expectFitsViewport(page, `/contacto at ${width}`);
    });

    test(`PAD-656: a complete form posts with no pedido and this page's address, then offers the way home (${width})`, async ({
      page,
    }) => {
      const bodies = await captureRelay(page);
      await page.goto("/contacto");
      const contact = await fillDemoForm(page.getByTestId("contact-page"));
      await contact.getByTestId("demo-submit").click();

      await expect(contact.getByTestId("demo-sent")).toBeVisible();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).not.toHaveProperty("pedido");
      expect(bodies[0]).toMatchObject({ firstname: "Rita", email: "rita@academia.pt", consent: true });
      expect(String(bodies[0].pageUri)).toMatch(/\/contacto$/);

      const home = contact.getByTestId("contact-home");
      await expect(home).toBeVisible();
      await expect(home).toHaveAttribute("href", "/");
      await expectFitsViewport(page, `/contacto sent at ${width}`);
    });
  });
}

test.describe("/contacto", () => {
  test("PAD-656: the way home reaches the site's home page", async ({ page }) => {
    await captureRelay(page);
    await page.goto("/contacto");
    const contact = await fillDemoForm(page.getByTestId("contact-page"));
    await contact.getByTestId("demo-submit").click();
    await contact.getByTestId("contact-home").click();
    await page.waitForURL(/\/$/);
    await expect(page.getByTestId("site")).toBeVisible();
    await expect(page.getByTestId("contact-page")).toHaveCount(0);
  });

  test("PAD-656: a failing API shows the failure and keeps what the visitor typed", async ({ page }) => {
    await page.route("**/api/public/demo-request", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }),
    );
    await page.goto("/contacto");
    const contact = await fillDemoForm(page.getByTestId("contact-page"));
    await contact.getByTestId("demo-submit").click();

    await expect(contact.getByTestId("demo-failed")).toBeVisible();
    await expect(contact.getByTestId("demo-failed-mailto")).toHaveAttribute("href", /^mailto:admin@levapp\.app/);
    await expect(contact.getByTestId("demo-sent")).toHaveCount(0);
    await expect(contact.getByTestId("demo-firstname")).toHaveValue("Rita");
    await expect(contact.getByTestId("demo-lastname")).toHaveValue("Pereira Lopes");
    await expect(contact.getByTestId("demo-email")).toHaveValue("rita@academia.pt");
    await expect(contact.getByTestId("demo-clube")).toHaveValue("Academia Norte");
  });

  test("PAD-656: the footer's cookie preferences reopen the banner", async ({ page }) => {
    await page.goto("/contacto");
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    await page.getByTestId("cookie-preferences").click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
  });

  test("PAD-656: nothing reaches HubSpot before the visitor accepts cookies", async ({ page }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);
    await page.goto("/contacto");
    await expect(page.getByTestId("contact-page")).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);

    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
    expect(await trackerRuns(page)).toBeUndefined();
  });
});
