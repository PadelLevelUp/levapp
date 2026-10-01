import { test, expect, type Page, type Request } from "@playwright/test";
import {
  isHubSpotFormsHost,
  isHubSpotHost,
} from "../../src/lib/hubspotHosts";
import { ui } from "../helpers/i18n";

/**
 * PAD-469 — HubSpot on the landing page (auth.landing-page rules 10–13).
 *
 * No HubSpot account is needed: every HubSpot host is route-stubbed. The
 * tracking stub sets the cookies the real script would (`hubspotutk`,
 * `__hstc`) and fires one beacon, so "tracking ran" is observable as a
 * request; the forms stub records the `hbspt.forms.create` options and
 * renders a placeholder form into the target.
 *
 * The guard that matters is the first test: nothing may reach a HubSpot host
 * before the visitor presses Aceitar. It must go red if anyone adds a plain
 * tracking `<script>` tag to the page.
 */

const PORTAL_ID = "149443437";
const TRACKING_SCRIPT = `https://js-eu1.hs-scripts.com/${PORTAL_ID}.js`;
/** Set on the Playwright Vite server (playwright.config.ts). */
const E2E_DEMO_FORM_ID = "e2e-demo-form-id";

const TRACKING_COOKIES = ["hubspotutk", "__hstc", "__hssc", "__hssrc"];

const TRACKING_STUB = `
  (function () {
    window.__hsTrackingLoaded = (window.__hsTrackingLoaded || 0) + 1;
    document.cookie = "hubspotutk=stub-utk; path=/";
    document.cookie = "__hstc=stub.hstc; path=/";
    new Image().src = "https://track-eu1.hubspot.com/__ptq.gif?stub=1";
  })();
`;

const FORMS_STUB = `
  window.hbspt = {
    forms: {
      create: function (opts) {
        window.__hsFormCreate = opts;
        var host = document.querySelector(opts.target);
        if (host) {
          var form = document.createElement("form");
          form.setAttribute("data-testid", "hs-stub-form");
          form.innerHTML = '<label>Email <input name="email" type="email"></label>';
          host.appendChild(form);
        }
        if (opts.onFormReady) opts.onFormReady(host);
      },
    },
  };
`;

function isHubSpot(request: Request) {
  return isHubSpotHost(new URL(request.url()).hostname);
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
      if (isHubSpotFormsHost(host) && url.endsWith(".js")) {
        return route.fulfill({
          contentType: "application/javascript",
          body: FORMS_STUB,
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
    (c) => TRACKING_COOKIES.includes(c.name) || c.name.startsWith("__hs_"),
  );
}

test.describe("landing page — HubSpot consent (PAD-469)", () => {
  test("nothing reaches HubSpot before the visitor accepts cookies", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    const seen: string[] = [];
    page.on("request", (r) => isHubSpot(r) && seen.push(r.url()));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: ui("landing.hero.coaches.title1", { exact: false }) }),
    ).toBeVisible();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);

    expect(requests).toEqual([]);
    expect(seen).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("Aceitar and Recusar carry the same weight, one click each", async ({
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
    const weight = (el: Element) => getComputedStyle(el).fontWeight;
    expect(await accept.evaluate(weight)).toBe(await decline.evaluate(weight));
  });

  test("Recusar keeps HubSpot out, and the choice survives a reload", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
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

    expect(requests).toEqual([]);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("Aceitar loads the EU tracking script once per page load", async ({
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
      .poll(() => page.evaluate(() => (window as any).__hsTrackingLoaded))
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
      .poll(() => page.evaluate(() => (window as any).__hsTrackingLoaded))
      .toBe(1);
  });

  test("revoking consent removes the HubSpot cookies and stops tracking", async ({
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
    expect(
      await page.evaluate(() => (window as any).__hsTrackingLoaded),
    ).toBeUndefined();
  });

  test("leaving the page after consent loads a fresh document, without the tracker", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__hsTrackingLoaded))
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
      await page.evaluate(() => (window as any).__hsTrackingLoaded),
    ).toBeUndefined();
    await expect(page.locator('script[src*="hs-scripts.com"]')).toHaveCount(0);
    expect(requests.slice(before)).toEqual([]);
  });

  test("a choice older than 12 months counts as no choice", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
    await page.addInitScript(() => {
      localStorage.setItem(
        "levapp.cookieConsent",
        JSON.stringify({ choice: "accepted", at: "2025-09-30T12:00:00Z" }),
      );
    });

    await page.goto("/");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await settle(page);
    expect(requests).toEqual([]);
  });

  test("a choice younger than 12 months still holds", async ({ page }) => {
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

test.describe("landing page — demo dialog (PAD-469)", () => {
  test("the demo button opens HubSpot's form, without consent and without the tracker", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    await expect(page.getByTestId("cookie-banner")).toBeVisible();

    await page.getByTestId("landing-demo-cta").first().click();
    const dialog = page.getByTestId("demo-dialog");
    await expect(dialog).toBeVisible();

    // The visitor is told who provides the form before they type.
    const notice = dialog.getByTestId("demo-hubspot-notice");
    await expect(notice).toContainText("HubSpot");
    await expect(notice.getByRole("link")).toHaveAttribute("href", "/privacy");

    await expect(dialog.getByTestId("hs-stub-form")).toBeVisible();
    const opts = await page.evaluate(() => (window as any).__hsFormCreate);
    expect(opts).toMatchObject({
      region: "eu1",
      portalId: PORTAL_ID,
      formId: E2E_DEMO_FORM_ID,
    });

    await settle(page);
    expect(requests.length).toBeGreaterThan(0);
    // Rule 11's one exception: the dialog may reach the forms hosts, and nothing else.
    expect(
      requests.filter((u) => !isHubSpotFormsHost(new URL(u).hostname)),
    ).toEqual([]);
    expect(requests).not.toContain(TRACKING_SCRIPT);
    expect(await trackingCookies(page)).toEqual([]);
  });

  test("reopening the dialog does not load the embed a second time", async ({
    page,
  }) => {
    const requests = await stubHubSpot(page);
    await page.goto("/");
    const cta = page.getByTestId("landing-demo-cta").first();

    await cta.click();
    await expect(
      page.getByTestId("demo-dialog").getByTestId("hs-stub-form"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("demo-dialog")).toHaveCount(0);

    await cta.click();
    await expect(
      page.getByTestId("demo-dialog").getByTestId("hs-stub-form"),
    ).toBeVisible();
    const embeds = requests.filter(
      (u) => isHubSpotFormsHost(new URL(u).hostname) && u.endsWith(".js"),
    );
    expect(embeds).toHaveLength(1);
  });
});
