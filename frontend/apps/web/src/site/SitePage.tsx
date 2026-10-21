/**
 * The new public site at `/` (PAD-656): the site chrome around the page of the chosen audience.
 * Not mounted yet: the switch commit makes HomeRoute render this instead of LandingPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CONTACT_EMAIL } from "@levelup/config";

import { DemoRequestDialog } from "@/components/landing/DemoRequestDialog";
import { demoFormId, hasMarketingSubscription } from "@/lib/hubspot";
import type { DemoPedido } from "@/lib/demoRequest";

import { useAudience } from "./audience";
import { SiteLayout } from "./SiteLayout";
import { CoachesPage } from "./pages/CoachesPage";
import { OthersPage } from "./pages/OthersPage";
import { PlayersPage } from "./pages/PlayersPage";

export default function SitePage() {
  const { t } = useTranslation();
  const [audience, setAudience] = useAudience();

  // The demo dialog (PAD-650's form). Without a form ID the buttons fall back to a mailto.
  const formId = demoFormId();
  const demoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("site.layout.demoSubject"))}`;
  const [demoOpen, setDemoOpen] = useState(false);
  const [pedido, setPedido] = useState<DemoPedido | null>(null);
  const openDemo = (next: DemoPedido | null = "demonstracao") => {
    if (!formId) {
      window.location.href = demoHref;
      return;
    }
    setPedido(next);
    setDemoOpen(true);
  };

  return (
    <SiteLayout
      audience={audience}
      onAudienceChange={setAudience}
      onDemo={() => openDemo()}
      // B: useSiteConsent() supplies the banner and its reopen (auth.landing-page rules 11–13).
      onCookiePreferences={() => undefined}
      consent={null}
      overlays={
        formId ? (
          <DemoRequestDialog
            open={demoOpen}
            onOpenChange={setDemoOpen}
            fallbackHref={demoHref}
            pedido={pedido ?? undefined}
            showMarketing={hasMarketingSubscription()}
          />
        ) : null
      }
    >
      {audience === "coaches" && <CoachesPage onDemo={openDemo} onSwitch={setAudience} />}
      {audience === "players" && <PlayersPage onDemo={openDemo} onSwitch={setAudience} />}
      {audience === "others" && <OthersPage onSwitch={setAudience} />}
    </SiteLayout>
  );
}
