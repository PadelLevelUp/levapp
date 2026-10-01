/**
 * HubSpot on the public landing page (PAD-469, auth.landing-page rules 10–13).
 *
 * Two separate things load from HubSpot, and they are gated differently:
 *   - the TRACKING script (`hs-scripts.com`, and whatever it loads in turn)
 *     runs only after the visitor accepts cookies (`cookieConsent.ts`);
 *   - the FORMS embed (`hsforms.net`) loads only when the visitor opens the
 *     demo dialog — a service they asked for, so it does not wait for consent.
 *
 * The portal ID and region are public by design (they sit in every page that
 * embeds HubSpot), so they are tracked constants. The demo form ID is build
 * configuration: `VITE_HUBSPOT_DEMO_FORM_ID`, passed into the Docker build from
 * a GitHub repository variable. Unset, the demo buttons stay a `mailto:`.
 */

export const HUBSPOT_PORTAL_ID = "149443437";
/** The portal lives in HubSpot's EU data centre; every host below is the EU one. */
export const HUBSPOT_REGION = "eu1";

export const HUBSPOT_TRACKING_SCRIPT_URL = `https://js-eu1.hs-scripts.com/${HUBSPOT_PORTAL_ID}.js`;
export const HUBSPOT_FORMS_EMBED_URL =
  "https://js-eu1.hsforms.net/forms/embed/v2.js";

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

interface HubSpotForms {
  create(options: {
    region: string;
    portalId: string;
    formId: string;
    target: string;
  }): void;
}

declare global {
  interface Window {
    hbspt?: { forms: HubSpotForms };
  }
}

let formsEmbed: Promise<HubSpotForms> | null = null;

/** Load the forms embed once per document; a failed load can be retried. */
export function loadFormsEmbed(): Promise<HubSpotForms> {
  if (window.hbspt?.forms) return Promise.resolve(window.hbspt.forms);
  if (!formsEmbed) {
    formsEmbed = new Promise<HubSpotForms>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HUBSPOT_FORMS_EMBED_URL;
      script.async = true;
      script.onload = () =>
        window.hbspt?.forms
          ? resolve(window.hbspt.forms)
          : reject(new Error("hbspt missing"));
      script.onerror = () => reject(new Error("forms embed failed to load"));
      document.body.appendChild(script);
    }).catch((err) => {
      formsEmbed = null;
      throw err;
    });
  }
  return formsEmbed;
}
