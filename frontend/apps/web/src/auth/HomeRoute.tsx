import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";
import DashboardPage from "@/pages/DashboardPage";
import LandingPage from "@/pages/LandingPage";

/**
 * `/` serves two different pages: the public landing page to a visitor, the
 * dashboard to a signed-in user — unless that user is a coach who is still
 * waiting for approval or has no club yet, in which case `/` sends them to
 * the screen that explains what happens next (auth.register rule 11).
 *
 * Rendering `null` while auth is still resolving — the same thing
 * `ProtectedRoute` does — matters more here than it does there. A session
 * restore takes one `/auth/me` round trip, and without the guard a returning
 * user would see the marketing page flash before their dashboard replaced it.
 */
export function HomeRoute() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const target = postLoginPath(user);
  if (target !== "/dashboard") {
    return <Navigate to={target} replace />;
  }

  return <DashboardPage />;
}
