/**
 * The new public site at `/` (PAD-656): the site chrome around the page of the chosen audience.
 * Not mounted yet: the switch commit makes HomeRoute render this instead of LandingPage.
 */
import { useAudience } from "./audience";
import { SiteFrame } from "./SiteFrame";
import { CoachesPage } from "./pages/CoachesPage";
import { OthersPage } from "./pages/OthersPage";
import { PlayersPage } from "./pages/PlayersPage";

export default function SitePage() {
  const [audience, setAudience] = useAudience();
  return (
    <SiteFrame audience={audience} onAudienceChange={setAudience}>
      {(openDemo) => (
        <>
          {audience === "coaches" && <CoachesPage onDemo={openDemo} onSwitch={setAudience} />}
          {audience === "players" && <PlayersPage onDemo={openDemo} onSwitch={setAudience} />}
          {audience === "others" && <OthersPage onSwitch={setAudience} />}
        </>
      )}
    </SiteFrame>
  );
}
