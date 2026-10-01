/**
 * Every host HubSpot's code on the landing page can talk to, in the two sets
 * auth.landing-page rules 10–11 are written against (PAD-469). This is the one
 * place the lists live: the E2E guard (`e2e/landing/hubspot-consent.spec.ts`)
 * and the embed measurement (`e2e/scripts/measure-hubspot-embed.ts`) import it,
 * so a new HubSpot CDN is added here once.
 *
 * Plain data, no imports: Playwright and Node's type stripping load it as-is.
 */

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
