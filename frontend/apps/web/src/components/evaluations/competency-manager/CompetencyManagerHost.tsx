import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { CompetencyManager } from "./CompetencyManager";
import { isCompetencyManagerOpen, withoutCompetencyManager } from "./search";

/**
 * Mounted once in the authenticated layout (evaluations.competencies rule 11). The
 * manager is reached from Settings, the player's evaluations and the class panel, all
 * through `openCompetencyManager`, which adds `?competencies=open` to the page the coach
 * is on. Closing removes that flag and nothing else, replacing the history entry so
 * Back does not reopen it. Coach-only.
 */
export function CompetencyManagerHost() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isCoach = user?.roles?.includes("coach") ?? false;
  const open = isCoach && isCompetencyManagerOpen(location.search);

  if (!isCoach) return null;
  return (
    <CompetencyManager
      open={open}
      onClose={() => navigate({ pathname: location.pathname, search: withoutCompetencyManager(location.search) }, { replace: true })}
    />
  );
}
