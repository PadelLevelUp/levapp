/**
 * The frame every new-site page sits in (PAD-656): SiteLayout plus the two things the layout
 * leaves to its caller — the cookie banner and HubSpot tracking (auth.landing-page rules 11–13,
 * useSiteConsent) and the one contact dialog (SiteDemoProvider). `children` receive the demo
 * opener, so a page needs no wiring of its own.
 */
import type { ReactNode } from "react";

import { CookieBanner } from "@/components/landing/CookieBanner";
import type { DemoPedido } from "@/lib/demoRequest";

import type { Audience } from "./audience";
import { SiteDemoProvider, useSiteDemo } from "./SiteDemo";
import { SiteLayout } from "./SiteLayout";
import { useSiteConsent } from "./useSiteConsent";

/** Opens the dialog; `null` (or nothing) records no HubSpot `pedido`. Falls back to the mailto. */
export type OpenDemo = (pedido?: DemoPedido | null) => void;

function Framed({
  audience,
  onAudienceChange,
  children,
}: {
  audience: Audience;
  onAudienceChange: (next: Audience) => void;
  children: (openDemo: OpenDemo) => ReactNode;
}) {
  const { bannerOpen, accept, decline, reopen } = useSiteConsent();
  const demo = useSiteDemo();
  const openDemo: OpenDemo = (pedido) => {
    if (!demo.open) {
      window.location.href = demo.mailtoHref;
      return;
    }
    demo.open(pedido ?? undefined);
  };
  return (
    <SiteLayout
      audience={audience}
      onAudienceChange={onAudienceChange}
      onDemo={() => openDemo("demonstracao")}
      onCookiePreferences={reopen}
      consent={bannerOpen ? <CookieBanner onAccept={accept} onDecline={decline} /> : null}
    >
      {children(openDemo)}
    </SiteLayout>
  );
}

export function SiteFrame(props: {
  audience: Audience;
  onAudienceChange: (next: Audience) => void;
  children: (openDemo: OpenDemo) => ReactNode;
}) {
  return (
    <SiteDemoProvider>
      <Framed {...props} />
    </SiteDemoProvider>
  );
}
