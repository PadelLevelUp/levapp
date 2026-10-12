import { test, expect, type Page } from "@playwright/test";
import {
  HUBSPOT_TRACKING_SCRIPT_URL as TRACKING_SCRIPT,
  isHubSpotCookie,
  isHubSpotHost,
} from "../../src/lib/hubspotConfig";
import { ui } from "../helpers/i18n";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-469 — HubSpot on the landing page (auth.landing-page rules 10–13).
 *
 * No HubSpot account is needed: every HubSpot host is route-stubbed. The
 * tracking stub sets the cookies the real script would (`hubspotutk`,
 * `__hstc`) and fires one beacon, so "tracking ran" is observable as a
 * request. Since PAD-617 the demo dialog reaches no HubSpot host at all: it
 * posts to LevApp's own API, which relays to HubSpot.
 *
 * The guard that matters is the first test: before the visitor presses
 * Aceitar, nothing leaves the page's own origin except the web fonts. It
 * watches every request, not a list of HubSpot hosts, so a HubSpot host nobody
 * listed still turns it red. Resource hints (preconnect, dns-prefetch) never
 * show up as requests; `landing-guards.test.ts` covers those statically.
 */

const TRACKING_STUB = `
  (function () {
    window.__hsTrackingLoaded = (window.__hsTrackingLoaded || 0) + 1;
    document.cookie = "hubspotutk=stub-utk; path=/";
    document.cookie = "__hstc=stub.hstc; path=/";
    new Image().src = "https://track-eu1.hubspot.com/__ptq.gif?stub=1";
  })();
`;

/** The only third-party hosts the landing page may reach without consent. */
const ALLOWED_FOREIGN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * Record every request to an origin other than the page's own and the font
 * hosts — whatever the host. Read it with `foreign()` once the page is loaded.
 */
function watchForeign(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) urls.push(r.url());
  });
  return () => {
    const own = new URL(page.url()).origin;
    return urls.filter((u) => {
      const url = new URL(u);
      return url.origin !== own && !ALLOWED_FOREIGN_HOSTS.has(url.hostname);
    });
  };
}

/** How many times the stubbed tracker has run in this document (undefined = never). */
function trackerRuns(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as { __hsTrackingLoaded?: number }).__hsTrackingLoaded);
}

/** Stub every HubSpot host and record each request that reaches one. */
async function stubHubSpot(page: Page) {
  const requests: string[] = [];
  await page.context().route(
    (url) => isHubSpotHost(url.hostname),
    async (route) => {
      const url = route.request().url();
      requests.push(url);
      const host = new URL(url).hostname;
      if (host.endsWith("hs-scripts.com")) {
        return route.fulfill({
          contentType: "application/javascript",
          body: TRACKING_STUB,
        });
      }
      return route.fulfill({ status: 204, body: "" });
    },
  );
  return requests;
}

/** Scroll the whole page so lazy content and scroll-triggered code get a chance to run. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
}

async function trackingCookies(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.filter(
    (c) => isHubSpotCookie(c.name),
  );
}

test.describe("landing page — HubSpot consent (PAD-469)", () => {
  test("US-469: nothing reaches HubSpot before the visitor accepts cookies", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);

    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("US-469: Aceitar and Recusar carry the same weight, one click each", async ({
    page,
  }) => {
    await stubHubSpot(page);
    await page.goto("/");
    const accept = page.getByTestId("cookie-accept");
    const decline = page.getByTestId("cookie-decline");
    await expect(accept).toBeVisible();
    await expect(decline).toBeVisible();

    const [a, d] = await Promise.all([
      accept.boundingBox(),
      decline.boundingBox(),
    ]);
    expect(a!.height).toBe(d!.height);
    expect(a!.width).toBe(d!.width);
    const weight = (el: Element) => getComputedStyle(el).fontWeight;
    expect(await accept.evaluate(weight)).toBe(await decline.evaluate(weight));
    // Same button: same variant, same classes.
    expect(await accept.getAttribute("class")).toBe(await decline.getAttribute("class"));
  });

  test("US-469: Recusar keeps HubSpot out, and the choice survives a reload", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    const foreign = watchForeign(page);
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await settle(page);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await settle(page);

    expect(foreign()).toEqual([]);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("US-469: Aceitar loads the EU tracking script once per page load", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    await expect
      .poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length)
      .toBe(1);
    await expect
      .poll(() => trackerRuns(page))
      .toBe(1);

    // A returning visitor who accepted gets tracking without the banner.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await expect
      .poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length)
      .toBe(2);
    await expect
      .poll(() => trackerRuns(page))
      .toBe(1);
  });

  test("US-469: revoking consent removes the HubSpot cookies and stops tracking", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect
      .poll(async () => (await trackingCookies(page)).map((c) => c.name).sort())
      .toEqual(["__hstc", "hubspotutk"]);

    await page.getByTestId("cookie-preferences").click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    const before = requests.length;
    await Promise.all([
      page.waitForEvent("load"),
      page.getByTestId("cookie-decline").click(),
    ]);
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await settle(page);

    expect(await trackingCookies(page)).toEqual([]);
    expect(requests.slice(before)).toEqual([]);
    // Rule 13's order: the choice is stored before the reload. Were it the
    // other way round, the new document would still read "accepted" and load
    // the tracker again — this assertion and the next are that failure.
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("levapp.cookieConsent")!).choice),
    ).toBe("declined");
    expect(
      await trackerRuns(page),
    ).toBeUndefined();
  });

  test("US-469: leaving the page after consent loads a fresh document, without the tracker", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect
      .poll(() => trackerRuns(page))
      .toBe(1);
    const before = requests.length;

    await page
      .getByRole("link", { name: ui("landing.nav.login") })
      .first()
      .click();
    await page.waitForURL("**/auth");
    await expect(page.locator("#username")).toBeVisible();
    await settle(page);

    expect(
      await trackerRuns(page),
    ).toBeUndefined();
    await expect(page.locator('script[src*="hs-scripts.com"]')).toHaveCount(0);
    expect(requests.slice(before)).toEqual([]);
  });

  test("US-469: declining again from the preferences closes the banner without a reload", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await page.evaluate(() => ((window as { __sameDoc?: boolean }).__sameDoc = true));

    await page.getByTestId("cookie-preferences").click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    // Same document: nothing was running, so there was nothing to reload away.
    expect(await page.evaluate(() => (window as { __sameDoc?: boolean }).__sameDoc)).toBe(true);
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
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    await expect
      .poll(() => requests.filter((u) => u === TRACKING_SCRIPT).length)
      .toBe(1);
  });
});

test.describe("landing page — every exit loads a new document (PAD-469, rule 5)", () => {
  /**
   * Walks every visible same-origin link on the page, per audience, plus the
   * one inside the demo dialog — found from the DOM, not from a list, so a new
   * exit is covered the day it is added. Each must land on a fresh document.
   */
  async function exitsOn(page: Page, path: string) {
    await page.goto(path);
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    return page.locator('a[href^="/"]:visible').count();
  }

  for (const audience of ["coaches", "players", "others"]) {
    test(`US-469: every link out of the ${audience} page is a new document`, async ({ page }) => {
      await stubHubSpot(page);
      const path = `/?audience=${audience}`;
      const count = await exitsOn(page, path);
      expect(count).toBeGreaterThan(3);

      for (let i = 0; i < count; i++) {
        await exitsOn(page, path);
        const link = page.locator('a[href^="/"]:visible').nth(i);
        const href = await link.getAttribute("href");
        await page.evaluate(() => ((window as { __sameDoc?: boolean }).__sameDoc = true));
        await link.click();
        await page.waitForLoadState("load");
        await expect
          .poll(() => page.evaluate(() => (window as { __sameDoc?: boolean }).__sameDoc), {
            message: `exit ${href} kept the landing document`,
          })
          .toBeUndefined();
      }
    });
  }

  test("US-469: the dialog's privacy link is a new document", async ({ page }) => {
    await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("landing-demo-cta").first().click();
    const notice = page.getByTestId("demo-hubspot-notice");
    await expect(notice).toBeVisible();
    await page.evaluate(() => ((window as { __sameDoc?: boolean }).__sameDoc = true));
    await notice.getByRole("link").click();
    await page.waitForURL("**/privacy");
    await expect
      .poll(() => page.evaluate(() => (window as { __sameDoc?: boolean }).__sameDoc))
      .toBeUndefined();
  });
});

test.describe("landing page — banner scope (PAD-469, rule 11)", () => {
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

test.describe("landing page — demo dialog (PAD-469, PAD-617)", () => {
  const RITA = {
    fullname: "Rita Pereira Lopes",
    email: "rita@academia.pt",
    phone: "+351 912 345 678",
    company: "Academia Norte",
    city: "Porto",
    alunos: "30",
    horas: "20",
  };

  async function fillDemoForm(page: Page) {
    const dialog = page.getByTestId("demo-dialog");
    for (const [field, value] of Object.entries(RITA)) {
      await dialog.getByTestId(`demo-${field}`).fill(value);
    }
    await dialog.getByTestId("demo-consent").click();
    return dialog;
  }

  test("PAD-617: with no form configured on the server, the dialog offers the email instead", async ({
    page,
  }) => {
    // The real E2E backend: HUBSPOT_DEMO_FORM_ID is unset there, so the relay answers 503.
    await page.goto("/");
    await page.getByTestId("landing-demo-cta").first().click();
    const dialog = await fillDemoForm(page);
    const answer = page.waitForResponse((r) => r.url().endsWith("/api/public/demo-request"));
    await dialog.getByTestId("demo-submit").click();
    expect((await answer).status()).toBe(503);
    await expect(dialog.getByTestId("demo-failed")).toBeVisible();
    await expect(dialog.getByTestId("demo-failed-mailto")).toHaveAttribute("href", /^mailto:admin@levapp\.app/);
  });

  test("PAD-617: the form posts to LevApp's API, never to HubSpot, and loads no tracker", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/public/demo-request", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();

    await page.getByTestId("landing-demo-cta").first().click();
    const dialog = page.getByTestId("demo-dialog");
    await expect(dialog).toBeVisible();
    // The visitor is told where the request is stored before they type.
    const notice = dialog.getByTestId("demo-hubspot-notice");
    await expect(notice).toContainText("HubSpot");
    await expect(notice.getByRole("link")).toHaveAttribute("href", "/privacy");

    await fillDemoForm(page);
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toContainText("Rita");

    expect(sent).toMatchObject({
      fullname: RITA.fullname,
      email: RITA.email,
      company: RITA.company,
      city: RITA.city,
      alunos: 30,
      horas: 20,
      consent: true,
      pedido: "demonstracao",
      website: "",
    });
    expect(typeof (sent as unknown as { elapsedMs: unknown }).elapsedMs).toBe("number");
    // No consent was given, so there is no hubspotutk to send.
    expect(sent).not.toHaveProperty("hutk");

    await settle(page);
    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
    expect(await trackerRuns(page)).toBeUndefined();
  });

  test("PAD-617: reopening the dialog shows a fresh form", async ({ page }) => {
    await page.route("**/api/public/demo-request", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
    );
    await page.goto("/");
    const cta = page.getByTestId("landing-demo-cta").first();
    await cta.click();
    const dialog = await fillDemoForm(page);
    await dialog.getByTestId("demo-submit").click();
    await expect(dialog.getByTestId("demo-sent")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("demo-dialog")).toHaveCount(0);

    await cta.click();
    await expect(page.getByTestId("demo-dialog").getByTestId("demo-fullname")).toHaveValue("");
    await expect(page.getByTestId("demo-dialog").getByTestId("demo-sent")).toHaveCount(0);
  });
});
