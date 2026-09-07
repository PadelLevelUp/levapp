import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Routes a coach may use only once approved and inside a club. The screens
 * that explain the waiting states are themselves protected, so they are
 * exempt from the redirect — otherwise a pending coach would bounce between
 * `/coach-pending` and itself.
 */
const ONBOARDING_PATHS = new Set(["/coach-pending", "/club-onboarding", "/connect"]);

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" />;
  }

  // auth.coach-approval rule 6 / auth.register rule 11: a coach who is not
  // approved, or approved with no club, is held on the matching screen from
  // every other coach route. Students are never redirected here.
  const target = postLoginPath(user);
  if (target !== "/dashboard" && !ONBOARDING_PATHS.has(location.pathname)) {
    return <Navigate to={target} replace />;
  }

  return children;
}
