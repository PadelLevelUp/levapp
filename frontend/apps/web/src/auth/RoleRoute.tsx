import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";

type RoleRouteProps = {
  allowedRoles: string[];
  children: React.ReactNode;
};

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  const hasAccess = allowedRoles.some(role =>
    user?.roles?.includes(role)
  );

  if (!hasAccess) {
    return <Navigate to="/page_not_found" replace />;
  }

  // Coach routes are closed to a coach who is not approved or has no club yet
  // (auth.coach-approval rule 8 is the server-side half of this).
  const target = postLoginPath(user);
  if (target !== "/dashboard") {
    return <Navigate to={target} replace />;
  }

  return children;
}
