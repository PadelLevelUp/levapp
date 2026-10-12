/**
 * HubSpot on the public landing page (PAD-469, auth.landing-page rules 10–13).
 *
 * Only the TRACKING script (`hs-scripts.com`, and whatever it loads in turn)
 * loads from HubSpot, and only after the visitor accepts cookies
 * (`cookieConsent.ts`). The demo dialog posts to LevApp's own API (PAD-617) and
 * never reaches a HubSpot host.
 *
 * The portal, region and URLs live in `hubspotConfig.ts`. The demo form ID is build
 * configuration: `VITE_HUBSPOT_DEMO_FORM_ID`, passed into the Docker build from
 * a GitHub repository variable. Unset, the demo buttons stay a `mailto:`.
 */

import { HUBSPOT_TRACKING_SCRIPT_URL } from "./hubspotConfig";

/** The demo form's ID, or `null` when this build has none (the mailto fallback). */
export function demoFormId(): string | null {
  const id = import.meta.env.VITE_HUBSPOT_DEMO_FORM_ID?.trim();
  return id ? id : null;
}

const TRACKING_SCRIPT_ID = "hs-script-loader";

/** Inject the tracking script once per document. Call only with consent. */
export function loadTrackingScript(): void {
  if (document.getElementById(TRACKING_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = TRACKING_SCRIPT_ID;
  script.type = "text/javascript";
  script.async = true;
  script.defer = true;
  script.src = HUBSPOT_TRACKING_SCRIPT_URL;
  document.body.appendChild(script);
}
