/**
 * PAD-469 gate: what the REAL HubSpot forms embed does before any submit.
 *
 * Not part of the suite: it loads HubSpot's public embed from the internet
 * (no account, no keys, never submits). Run it before promoting to prod a
 * build that carries a demo form ID, with that ID:
 *
 *   cd frontend/apps/web
 *   HUBSPOT_DEMO_FORM_ID=<form guid> node e2e/scripts/measure-hubspot-embed.ts
 *
 * Expected (auth.landing-page rules 10–11): requests only to the forms hosts
 * in `src/lib/hubspotHosts.ts`, no first-party cookie, nothing in storage.
 * The script prints every request, cookie and storage key, then PASS or FAIL.
 * Measured 2026-10-01 with a placeholder ID: PASS — js-eu1.hsforms.net +
 * forms-eu1.hsforms.com only; one third-party cookie, Cloudflare's `__cf_bm`
 * on `.hsforms.net` (bot management, ~30 min).
 */
import { chromium } from "@playwright/test";
import { isHubSpotFormsHost } from "../../src/lib/hubspotHosts.ts";

const PORTAL_ID = "149443437";
const FORM_ID =
  process.env.HUBSPOT_DEMO_FORM_ID ?? "00000000-0000-0000-0000-000000000000";
// A made-up first-party origin, served locally, so first-party cookies are observable.
const ORIGIN = "https://measure.levapp.test";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const requests: string[] = [];
page.on("request", (r) => requests.push(r.url()));

await page.route(`${ORIGIN}/**`, (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body><div id="t"></div>
<script src="https://js-eu1.hsforms.net/forms/embed/v2.js"></script>
<script>
  window.addEventListener("load", function () {
    hbspt.forms.create({ region: "eu1", portalId: "${PORTAL_ID}",
      formId: "${FORM_ID}", target: "#t" });
  });
</script></body></html>`,
  }),
);
await page.goto(`${ORIGIN}/`);
await page.waitForTimeout(10_000);

const cookies = await context.cookies();
const storage = await page.evaluate(() => ({
  local: Object.keys(localStorage),
  session: Object.keys(sessionStorage),
  documentCookie: document.cookie,
}));
const rendered = await page.locator("#t form").count();
await browser.close();

const external = requests.filter((u) => !u.startsWith(ORIGIN));
const offList = external.filter((u) => !isHubSpotFormsHost(new URL(u).hostname));
const firstParty = cookies.filter((c) => c.domain.endsWith("levapp.test"));

console.log(`measured at ${new Date().toISOString()} with form ${FORM_ID}`);
console.log(`form rendered: ${rendered > 0 ? "yes" : "no (placeholder or wrong ID?)"}`);
console.log("requests:");
for (const u of external) console.log(`  ${u.slice(0, 160)}`);
console.log("cookies:");
for (const c of cookies) console.log(`  ${c.name} on ${c.domain}`);
console.log(`storage: ${JSON.stringify(storage)}`);

const failures = [
  ...offList.map((u) => `request outside the forms hosts: ${u}`),
  ...firstParty.map((c) => `first-party cookie: ${c.name}`),
  ...(storage.documentCookie ? [`document.cookie: ${storage.documentCookie}`] : []),
  ...storage.local.map((k) => `localStorage key: ${k}`),
  ...storage.session.map((k) => `sessionStorage key: ${k}`),
];
console.log(failures.length ? `FAIL\n  ${failures.join("\n  ")}` : "PASS");
process.exit(failures.length ? 1 : 0);
