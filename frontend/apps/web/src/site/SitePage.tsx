/**
 * The public site at `/` (PAD-656): the site chrome around the page of the chosen audience.
 * Each audience page is its own lazy chunk (a visitor on "Outros" never downloads the coaches
 * page's calendar, demo and board); the build preloads the URL's audience with the site chunks
 * (vite.config.ts `sitePreload`), so the split costs no extra round trip.
 */
import { lazy, Suspense } from "react";

import { useAudience } from "./audience";
import { SiteFrame } from "./SiteFrame";

const CoachesPage = lazy(() => import("./pages/CoachesPage").then((m) => ({ default: m.CoachesPage })));
const PlayersPage = lazy(() => import("./pages/PlayersPage").then((m) => ({ default: m.PlayersPage })));
const OthersPage = lazy(() => import("./pages/OthersPage").then((m) => ({ default: m.OthersPage })));

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
