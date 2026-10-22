import { test, expect, type Page } from "@playwright/test";
import { HUBSPOT_TRACKING_SCRIPT_URL as TRACKING_SCRIPT } from "../../src/lib/hubspotConfig";
import { loginAsCoach } from "../helpers/auth";
import { ui } from "../helpers/i18n";
import {
  captureRelay,
  expectSiteUp,
  fillDemoForm,
  plantSentinel,
  sentinel,
  settle,
  stubHubSpot,
  trackerRuns,
  trackingCookies,
  watchForeign,
} from "./public-site";

/**
 * PAD-469 — HubSpot on the public site (auth.landing-page rules 10–13), re-aimed at the new site
 * by PAD-656 (ported from the old e2e/landing/hubspot-consent.spec.ts). The cookie banner's ids
 * are unchanged; the footer's "Preferências de cookies" is `cookie-preferences`, and the contact
 * dialog is opened from the header's `site-demo` ("Pedir demonstração", pedido=demonstracao).
 *
 * The guard that matters is the first test: before the visitor presses Aceitar, nothing leaves
 * the page's own origin, the web fonts included (self-hosted since PAD-635). It watches every
 * request, not a list of HubSpot hosts, so a HubSpot host nobody listed still turns it red.
 * Resource hints (preconnect, dns-prefetch) never show up as requests; `landing-guards.test.ts`
 * covers those statically.
 *
 * Desktop width: the header's Entrar and Pedir demonstração sit in the ☰ menu at 992px and below.
 */
test.use({ viewport: { width: 1280, height: 800 } });

test.describe("public site — HubSpot consent (PAD-469)", () => {
  test("US-469: nothing reaches HubSpot before the visitor accepts cookies", async ({ page }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);

    await page.goto("/");
    await expectSiteUp(page);
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);

    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("US-469: Aceitar and Recusar carry the same weight, one click each", async ({ page }) => {
    await stubHubSpot(page);
    await page.goto("/");
    const accept = page.getByTestId("cookie-accept");
    const decline = page.getByTestId("cookie-decline");
    await expect(accept).toBeVisible();
    await expect(decline).toBeVisible();

    const [a, d] = await Promise.all([accept.boundingBox(), decline.boundingBox()]);
    expect(a!.height).toBe(d!.height);
    expect(a!.width).toBe(d!.width);
    const weight = (el: Element) => getComputedStyle(el).fontWeight;
    expect(await accept.evaluate(weight)).toBe(await decline.evaluate(weight));
    // Same button: same variant, same classes.
    expect(await accept.getAttribute("class")).toBe(await decline.getAttribute("class"));
  });

  test("US-469: Recusar keeps HubSpot out, and the choice survives a reload", async ({ page }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await settle(page);

    await page.reload();
    await expectSiteUp(page);
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await settle(page);

    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("US-469: Aceitar loads the EU tracking script once per page load", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    await expect.poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length).toBe(1);
    await expect.poll(() => trackerRuns(page)).toBe(1);

    // A returning visitor who accepted gets tracking without the banner.
    await page.reload();
    await expectSiteUp(page);
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await expect.poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length).toBe(2);
    await expect.poll(() => trackerRuns(page)).toBe(1);
  });

  test("US-469: revoking consent removes the HubSpot cookies and stops tracking", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect
      .poll(async () => (await trackingCookies(page)).map((c) => c.name).sort())
      .toEqual(["__hstc", "hubspotutk"]);

    await page.getByTestId("cookie-preferences").click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    const before = requests.length;
    await Promise.all([page.waitForEvent("load"), page.getByTestId("cookie-decline").click()]);
    await expectSiteUp(page);
    await settle(page);

    expect(await trackingCookies(page)).toEqual([]);
    expect(requests.slice(before)).toEqual([]);
    // Rule 13's order: the choice is stored before the reload. Were it the
    // other way round, the new document would still read "accepted" and load
    // the tracker again — this assertion and the next are that failure.
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("levapp.cookieConsent")!).choice),
    ).toBe("declined");
    expect(await trackerRuns(page)).toBeUndefined();
  });

  test("US-469: leaving the page after consent loads a fresh document, without the tracker", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect.poll(() => trackerRuns(page)).toBe(1);
    const before = requests.length;

    await page.getByTestId("site-login").click();
    await page.waitForURL("**/auth");
    await expect(page.locator("#username")).toBeVisible();
    await settle(page);

    expect(await trackerRuns(page)).toBeUndefined();
    await expect(page.locator('script[src*="hs-scripts.com"]')).toHaveCount(0);
    expect(requests.slice(before)).toEqual([]);
  });

  test("US-469: declining again from the preferences closes the banner without a reload", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await plantSentinel(page);

    await page.getByTestId("cookie-preferences").click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    // Same document: nothing was running, so there was nothing to reload away.
    expect(await sentinel(page)).toBe(true);
    expect(requests).toEqual([]);
  });

  test("US-469: a choice older than 12 months counts as no choice, and its cookies go", async ({
    page,
    baseURL,
  }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);
    await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
    await page.addInitScript(() => {
      localStorage.setItem(
        "levapp.cookieConsent",
        JSON.stringify({ choice: "accepted", at: "2025-09-30T12:00:00Z" }),
      );
    });
    // What the tracker left behind while consent was valid.
    await page.context().addCookies([
      { name: "hubspotutk", value: "old-utk", url: baseURL! },
      { name: "__hstc", value: "old.hstc", url: baseURL! },
    ]);

    await page.goto("/");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);

    expect(await trackingCookies(page)).toEqual([]);
    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
  });

  test("US-469: a choice younger than 12 months still holds", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
    await page.addInitScript(() => {
      localStorage.setItem(
        "levapp.cookieConsent",
        JSON.stringify({ choice: "accepted", at: "2025-10-15T12:00:00Z" }),
      );
    });

    await page.goto("/");
    await expectSiteUp(page);
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await expect.poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length).toBe(1);
  });
});

test.describe("public site — every exit loads a new document (PAD-469, rule 5)", () => {
  /**
   * Walks every visible same-origin link on the page, per audience, plus the one inside the demo
   * dialog — found from the DOM, not from a list, so a new exit is covered the day it is added.
   * Each must land on a fresh document.
   *
   * `/contacto` is excluded by href: the footer's "Contacto" is an in-site page (a client-side
   * route inside the same frame, not an exit); home.spec.ts covers that it reaches the form.
   */
  const EXITS = 'a[href^="/"]:not([href="/contacto"]):visible';

  async function exitsOn(page: Page, path: string) {
    await page.goto(path);
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    return page.locator(EXITS).count();
  }

  // The slug is the ?para= value (src/site/audience.ts).
  for (const [audience, slug] of [
    ["coaches", "treinadores"],
    ["players", "jogadores"],
    ["others", "outros"],
  ] as const) {
    test(`US-469: every link out of the ${audience} page is a new document`, async ({ page }) => {
      await stubHubSpot(page);
      const path = `/?para=${slug}`;
      // The layout alone has Entrar, the two legal links and the banner's privacy link.
      const count = await exitsOn(page, path);
      expect(count).toBeGreaterThanOrEqual(4);

      for (let i = 0; i < count; i++) {
        await exitsOn(page, path);
        const link = page.locator(EXITS).nth(i);
        const href = await link.getAttribute("href");
        await plantSentinel(page);
        await link.click();
        await page.waitForLoadState("load");
        await expect
          .poll(() => sentinel(page), { message: `exit ${href} kept the site document` })
          .toBeUndefined();
      }
    });
  }

  test.fixme(
    "PAD-656: re-pin when the coaches page sections land (E) — its content exits (hero, how-it-works, closing CTA) join the walk above, which finds them from the DOM; add a count floor then",
    async () => {},
  );
  test.fixme(
    "PAD-656: re-pin when the players page sections land (E) — Entrar (/auth) and Recebi um convite (/support) are exits only that page has",
    async () => {},
  );
  test.fixme(
    "PAD-656: re-pin when the others page sections land (E) — its content exits join the walk above",
    async () => {},
  );

  test("US-469: the dialog's privacy link is a new document", async ({ page }) => {
    await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("site-demo").click();
    const privacy = page.getByTestId("demo-privacy-line");
    await expect(privacy).toBeVisible();
    await plantSentinel(page);
    await privacy.getByRole("link").click();
    await page.waitForURL("**/privacy");
    await expect.poll(() => sentinel(page)).toBeUndefined();
  });

  test("US-469: the footer's privacy and terms links are new documents", async ({ page }) => {
    await stubHubSpot(page);
    for (const [id, url] of [
      ["site-footer-privacy", "**/privacy"],
      ["site-footer-terms", "**/terms"],
    ] as const) {
      await page.goto("/");
      await plantSentinel(page);
      await page.getByTestId(id).click();
      await page.waitForURL(url);
      await expect.poll(() => sentinel(page)).toBeUndefined();
    }
  });
});

test.describe("public site — banner scope (PAD-469, rule 11)", () => {
  test("US-469: the signed-in app never shows the cookie banner", async ({ page }) => {
    const requests = await stubHubSpot(page);
    await loginAsCoach(page);
    for (const path of ["/", "/calendar", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    }
    expect(requests).toEqual([]);
  });
});

test.describe("public site — contact dialog (PAD-469, PAD-617, PAD-650)", () => {
  test("PAD-617: with no form configured on the server, the dialog offers the email and a retry", async ({
    page,
  }) => {
    // The real E2E backend: HUBSPOT_DEMO_FORM_ID is unset there, so the relay answers 503.
    await page.goto("/");
    await page.getByTestId("site-demo").click();
    const dialog = await fillDemoForm(page.getByTestId("demo-dialog"));
    const answer = page.waitForResponse((r) => r.url().endsWith("/api/public/demo-request"));
    await dialog.getByTestId("demo-submit").click();
    expect((await answer).status()).toBe(503);
    await expect(dialog.getByTestId("demo-failed")).toBeVisible();
    await expect(dialog.getByTestId("demo-failed-mailto")).toHaveAttribute("href", /^mailto:admin@levapp\.app/);
    await expect(dialog.getByTestId("demo-retry")).toBeVisible();
  });

  test("PAD-650: the header's demo button opens the dialog and nothing is sent until submit", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    const bodies = await captureRelay(page);
    await page.goto("/?para=treinadores");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();

    await page.getByTestId("site-demo").click();
    await expect(page.getByTestId("demo-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("demo-dialog")).toHaveCount(0);

    await settle(page);
    expect(bodies).toEqual([]);
    expect(requests).toEqual([]);
  });

  test("PAD-650: the menu's demo button (phone width) opens the dialog too", async ({ page }) => {
    const bodies = await captureRelay(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("site-burger").click();
    await page
      .getByTestId("site-menu")
      .getByRole("button", { name: ui("site.layout.demo") })
      .click();
    await expect(page.getByTestId("demo-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("demo-dialog")).toHaveCount(0);
    expect(bodies).toEqual([]);
  });

  test.fixme(
    "PAD-656: re-pin when the audience pages land (E) — the hero, how-it-works and closing demo buttons each open the dialog (the old test walked every landing-demo-cta, at least four)",
    async () => {},
  );

  test("PAD-650: the form posts the ticket's fields to LevApp's API, never to HubSpot", async ({ page }) => {
    const requests = await stubHubSpot(page);
    const bodies = await captureRelay(page);
    await page.goto("/");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();

    await page.getByTestId("site-demo").click();
    const dialog = page.getByTestId("demo-dialog");
    await expect(dialog.getByTestId("demo-hubspot-notice")).toBeVisible();
    await expect(dialog.getByTestId("demo-privacy-line").getByRole("link")).toHaveAttribute("href", "/privacy");
    // The build carries a subscription id (playwright.config.ts), so the optional box shows.
    await expect(dialog.getByTestId("demo-marketing")).toHaveAttribute("data-state", "unchecked");

    await fillDemoForm(dialog);
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      firstname: "Rita",
      lastname: "Pereira Lopes",
      phone: "+351 912 345 678",
      email: "rita@academia.pt",
      clube: "Academia Norte",
      gestao: ["ferramentas_classicas", "ninguem_trata"],
      lembretes: "diariamente",
      tempo: "mais_3h",
      consent: true,
      marketing: false,
      pedido: "demonstracao",
      website: "",
    });
    expect(typeof bodies[0].elapsedMs).toBe("number");
    // No cookie choice was made, so there is no hubspotutk to send.
    expect(bodies[0]).not.toHaveProperty("hutk");

    await settle(page);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
    expect(await trackerRuns(page)).toBeUndefined();
  });

  test("PAD-650: the /contacto form sends no pedido (the old \"Falar connosco\")", async ({ page }) => {
    const bodies = await captureRelay(page);
    await page.goto("/contacto");
    const form = await fillDemoForm(page.getByTestId("contact-page"));
    await form.getByTestId("demo-submit").click();
    await expect(form.getByTestId("demo-sent")).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty("pedido");
  });

  test("PAD-650: hutk goes along with cookie consent and stays home after a decline", async ({ page }) => {
    await stubHubSpot(page);
    const bodies = await captureRelay(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    // The tracking stub sets hubspotutk=stub-utk once it runs.
    await expect.poll(() => trackerRuns(page)).toBe(1);

    await page.getByTestId("site-demo").click();
    let dialog = await fillDemoForm(page.getByTestId("demo-dialog"));
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toBeVisible();
    expect(bodies[0]).toHaveProperty("hutk", "stub-utk");

    // Decline on a fresh visit, then leave a hubspotutk behind (as a cookie on HubSpot's parent
    // domain would be): the dialog still sends none, because the choice is "declined".
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await page.evaluate(() => (document.cookie = "hubspotutk=lingering; path=/"));
    await page.getByTestId("site-demo").click();
    dialog = await fillDemoForm(page.getByTestId("demo-dialog"));
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty("hutk");
  });

  test("PAD-650: an incomplete form is refused before anything is sent", async ({ page }) => {
    const bodies = await captureRelay(page);
    await page.goto("/");
    await page.getByTestId("site-demo").click();
    const dialog = page.getByTestId("demo-dialog");
    await dialog.getByTestId("demo-submit").click();
    for (const f of ["firstname", "lastname", "phone", "email", "clube", "gestao", "lembretes", "tempo", "consent"]) {
      await expect(dialog.getByTestId(`demo-${f}-error`)).toBeVisible();
    }
    await expect(dialog.getByTestId("demo-firstname")).toBeFocused();
    await settle(page);
    expect(bodies).toEqual([]);
  });

  test("PAD-617: reopening the dialog shows a fresh form", async ({ page }) => {
    await captureRelay(page);
    await page.goto("/");
    const cta = page.getByTestId("site-demo");
    await cta.click();
    const dialog = await fillDemoForm(page.getByTestId("demo-dialog"));
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("demo-dialog")).toHaveCount(0);

    await cta.click();
    await expect(page.getByTestId("demo-dialog").getByTestId("demo-firstname")).toHaveValue("");
    await expect(page.getByTestId("demo-dialog").getByTestId("demo-sent")).toHaveCount(0);
  });
});
