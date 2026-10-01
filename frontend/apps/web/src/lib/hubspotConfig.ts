/**
 * HubSpot's public facts for the landing page (PAD-469): the portal, its EU
 * region, the two script URLs, the cookies the tracker sets, and every host
 * HubSpot's code can talk to, in the two sets auth.landing-page rules 10–11 are
 * written against. This is the one place they live: the app (`hubspot.ts`,
 * `cookieConsent.ts`), the E2E guard (`e2e/landing/hubspot-consent.spec.ts`)
 * and the embed measurement (`e2e/scripts/measure-hubspot-embed.ts`) all import
 * it, so a new HubSpot CDN or cookie is added here once.
 *
 * Plain data, no imports and no `import.meta`: Playwright and Node's type
 * stripping load it as-is.
 */

/** Public by design: it sits in every page that embeds HubSpot. */
export const HUBSPOT_PORTAL_ID = "149443437";
/** The portal lives in HubSpot's EU data centre. */
export const HUBSPOT_REGION = "eu1";

export const HUBSPOT_TRACKING_SCRIPT_URL = `https://js-${HUBSPOT_REGION}.hs-scripts.com/${HUBSPOT_PORTAL_ID}.js`;
export const HUBSPOT_FORMS_EMBED_URL = `https://js-${HUBSPOT_REGION}.hsforms.net/forms/embed/v2.js`;

/** The first-party cookies HubSpot's tracker sets, plus its `__hs_*` family. */
export const HUBSPOT_COOKIE_NAMES = ["hubspotutk", "__hstc", "__hssc", "__hssrc"];

export function isHubSpotCookie(name: string): boolean {
  return HUBSPOT_COOKIE_NAMES.includes(name) || name.startsWith("__hs_");
}

/** The forms embed and its API — the only HubSpot hosts the demo dialog may reach. */
export const HUBSPOT_FORMS_HOST_SUFFIXES = ["hsforms.net", "hsforms.com"];

/** The tracking script and everything it loads — reachable only after "Aceitar". */
export const HUBSPOT_TRACKING_HOST_SUFFIXES = [
  "hs-scripts.com",
  "hs-analytics.net",
  "hs-banner.com",
  "hscollectedforms.net",
  "hubspot.com",
  "hubspot.net",
  "hubapi.com",
  "hsadspixel.net",
  "usemessages.com",
  "hsappstatic.net",
  "hs-sites.com",
  "hs-sites-eu1.com",
  "hscta.net",
];

function matches(hostname: string, suffixes: string[]): boolean {
  return suffixes.some((s) => hostname === s || hostname.endsWith(`.${s}`));
}

export function isHubSpotFormsHost(hostname: string): boolean {
  return matches(hostname, HUBSPOT_FORMS_HOST_SUFFIXES);
}

export function isHubSpotHost(hostname: string): boolean {
  return (
    isHubSpotFormsHost(hostname) ||
    matches(hostname, HUBSPOT_TRACKING_HOST_SUFFIXES)
  );
}
