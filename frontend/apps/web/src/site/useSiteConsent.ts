import { useEffect, useState } from "react";
import { loadTrackingScript } from "@/lib/hubspot";
import {
  clearHubSpotCookies,
  loadConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/cookieConsent";

/**
 * The public site's cookie choice and HubSpot tracking (auth.landing-page rules 11–13), in one
 * place for every public page: the landing page until the switch, then the new site's layout
 * (PAD-656). Nothing reaches HubSpot's tracking hosts until the visitor accepts.
 */
export function useSiteConsent() {
  const [consent, setConsent] = useState<ConsentChoice | null>(() => loadConsent());
  const [bannerOpen, setBannerOpen] = useState(consent === null);

  useEffect(() => {
    if (consent === "accepted") loadTrackingScript();
  }, [consent]);

  const accept = () => {
    writeConsent("accepted");
    setConsent("accepted");
    setBannerOpen(false);
  };

  const decline = () => {
    const wasAccepted = consent === "accepted";
    // Rule 13's order: cookies, then the stored choice, then the reload — a
    // reload before the write would come back accepted and loop.
    clearHubSpotCookies();
    writeConsent("declined");
    if (wasAccepted) {
      // The tracking script is already running in this document; only a new one stops it.
      window.location.reload();
      return;
    }
    setConsent("declined");
    setBannerOpen(false);
  };

  /** The footer's "Preferências de cookies" (rule 13). */
  const reopen = () => setBannerOpen(true);

  return { bannerOpen, accept, decline, reopen };
}
