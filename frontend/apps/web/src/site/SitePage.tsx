/**
 * The public site at `/` (PAD-656): the site chrome around the page of the chosen audience.
 * Each audience page is its own lazy chunk, loaded from `routes/lazyPages` like every page (a
 * visitor on "Outros" never downloads the coaches page's calendar, demo and board); the build
 * preloads the URL's audience with the site chunks (vite.config.ts `sitePreload`), so the split
 * costs no extra round trip.
 */
import { Suspense } from "react";

import { SiteCoachesPage as CoachesPage, SiteOthersPage as OthersPage, SitePlayersPage as PlayersPage } from "@/routes/lazyPages";

import { useAudience } from "./audience";
import { SiteFrame } from "./SiteFrame";

export default function SitePage() {
  const [audience, setAudience] = useAudience();
  return (
    <SiteFrame audience={audience} onAudienceChange={setAudience}>
      {(openDemo) => (
        // An empty, page-tall placeholder while an audience page loads (no spinner, no shift).
        <Suspense fallback={<div className="min-h-screen" data-testid="site-page-loading" />}>
          {audience === "coaches" && <CoachesPage onDemo={openDemo} onSwitch={setAudience} />}
          {audience === "players" && <PlayersPage onDemo={openDemo} onSwitch={setAudience} />}
          {audience === "others" && <OthersPage onSwitch={setAudience} />}
        </Suspense>
      )}
    </SiteFrame>
  );
}
