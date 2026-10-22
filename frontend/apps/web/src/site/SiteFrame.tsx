/**
 * The frame every new-site page sits in (PAD-656): SiteLayout plus the two things the layout
 * leaves to its caller — the cookie banner and HubSpot tracking (auth.landing-page rules 11–13,
 * useSiteConsent) and the one contact dialog (SiteDemoProvider). `children` receive the demo
 * opener, so a page needs no wiring of its own.
 */
import { useLayoutEffect, type ReactNode } from "react";

import { CookieBanner } from "@/components/landing/CookieBanner";
import type { DemoPedido } from "@/lib/demoRequest";
import { forceTheme } from "@/lib/forcedTheme";

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
  // The site is light-only: a dark system theme must not reach its token-styled pieces
  // (banner, dialog, form). Layout effect, so the first paint is already light.
  useLayoutEffect(() => {
    forceTheme("light");
    return () => forceTheme(undefined);
  }, []);
  return (
    <SiteDemoProvider>
      <Framed {...props} />
    </SiteDemoProvider>
  );
}
