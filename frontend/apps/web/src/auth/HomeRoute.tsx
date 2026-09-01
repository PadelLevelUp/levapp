import { useAuth } from "@/auth/AuthContext";
import DashboardPage from "@/pages/DashboardPage";
import LandingPage from "@/pages/LandingPage";

/**
 * `/` serves two different pages: the public landing page to a visitor, the
 * dashboard to a signed-in user.
 *
 * Rendering `null` while auth is still resolving — the same thing
 * `ProtectedRoute` does — matters more here than it does there. A session
 * restore takes one `/auth/me` round trip, and without the guard a returning
 * user would see the marketing page flash before their dashboard replaced it.
 */
export function HomeRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  return isAuthenticated ? <DashboardPage /> : <LandingPage />;
}
