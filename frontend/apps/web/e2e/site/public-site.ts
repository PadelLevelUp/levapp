/**
 * Shared plumbing for the public-site specs (PAD-656): consent.spec.ts, contact.spec.ts and
 * home.spec.ts. Ported from the old landing specs' local helpers (PAD-469); the behaviour is the
 * same, only the page they drive changed.
 *
 * No HubSpot account is needed: every HubSpot host is route-stubbed. The tracking stub sets the
 * cookies the real script would (`hubspotutk`, `__hstc`) and fires one beacon, so "tracking ran"
 * is observable as a request.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { isHubSpotCookie, isHubSpotHost } from "../../src/lib/hubspotConfig";

export const TRACKING_STUB = `
  (function () {
    window.__hsTrackingLoaded = (window.__hsTrackingLoaded || 0) + 1;
    document.cookie = "hubspotutk=stub-utk; path=/";
    document.cookie = "__hstc=stub.hstc; path=/";
    new Image().src = "https://track-eu1.hubspot.com/__ptq.gif?stub=1";
  })();
`;

/**
 * Record every request to an origin other than the page's own, whatever the host. Read it with
 * `foreign()` once the page is loaded. No third-party host is allowed without consent; the fonts
 * are self-hosted (PAD-635).
 */
export function watchForeign(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) urls.push(r.url());
  });
  return () => {
    const own = new URL(page.url()).origin;
    return urls.filter((u) => new URL(u).origin !== own);
  };
}

/** How many times the stubbed tracker has run in this document (undefined = never). */
export function trackerRuns(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as { __hsTrackingLoaded?: number }).__hsTrackingLoaded);
}

/** Stub every HubSpot host and record each request that reaches one. */
export async function stubHubSpot(page: Page) {
  const requests: string[] = [];
  await page.context().route(
    (url) => isHubSpotHost(url.hostname),
    async (route) => {
      const url = route.request().url();
      requests.push(url);
      if (new URL(url).hostname.endsWith("hs-scripts.com")) {
        return route.fulfill({ contentType: "application/javascript", body: TRACKING_STUB });
      }
      return route.fulfill({ status: 204, body: "" });
    },
  );
  return requests;
}

/** Scroll the whole page so lazy content and scroll-triggered code get a chance to run. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
}

export async function trackingCookies(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.filter((c) => isHubSpotCookie(c.name));
}

/** The shell is up: the site's frame is on screen (a stand-in for the old hero heading). */
export async function expectSiteUp(page: Page) {
  await expect(page.getByTestId("site")).toBeVisible();
}

/**
 * Fill the contact form inside `scope`: the demo dialog (`demo-dialog`) or the /contacto page
 * (`contact-page`). The ids are DemoRequestForm's, shared by both.
 */
export async function fillDemoForm(scope: Locator) {
  await scope.getByTestId("demo-firstname").fill("Rita");
  await scope.getByTestId("demo-lastname").fill("Pereira Lopes");
  await scope.getByTestId("demo-phone").fill("912 345 678");
  await scope.getByTestId("demo-email").fill("rita@academia.pt");
  await scope.getByTestId("demo-clube").fill("Academia Norte");
  await scope.getByTestId("demo-gestao-ninguem_trata").click();
  await scope.getByTestId("demo-gestao-ferramentas_classicas").click();
  await scope.getByTestId("demo-lembretes-diariamente").click();
  await scope.getByTestId("demo-tempo-mais_3h").click();
  await scope.getByTestId("demo-consent").click();
  return scope;
}

/** Answer the relay with 200 and keep every body it receives. */
export async function captureRelay(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/public/demo-request", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return bodies;
}

/** A document-level sentinel: it survives an in-place change and dies with a reload. */
export function plantSentinel(page: Page) {
  return page.evaluate(() => ((window as { __sameDoc?: boolean }).__sameDoc = true));
}

export function sentinel(page: Page) {
  return page.evaluate(() => (window as { __sameDoc?: boolean }).__sameDoc);
}
