import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

type SuperAdminRouteProps = {
  children: React.ReactNode;
};

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!user?.isSuperAdmin) {
    return <Navigate to="/page_not_found" replace />;
  }

  return children;
}
