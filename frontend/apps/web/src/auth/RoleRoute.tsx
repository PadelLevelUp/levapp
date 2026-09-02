import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

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

  return children;
}
