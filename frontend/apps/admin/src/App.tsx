import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ApprovalsPage } from "@/pages/ApprovalsPage";
import { AuditPage } from "@/pages/AuditPage";
import { EngineHealthPage } from "@/pages/EngineHealthPage";
import { ClubPage } from "@/pages/ClubPage";
import { ClubsPage } from "@/pages/ClubsPage";
import { SwitchesPage } from "@/pages/SwitchesPage";
import { HomePage } from "@/pages/HomePage";
import { NotConfiguredPage } from "@/pages/NotConfiguredPage";
import { RolesPage } from "@/pages/RolesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignInPage } from "@/pages/SignInPage";
import { UserPage } from "@/pages/UserPage";
import { UsersPage } from "@/pages/UsersPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function Gate() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Rule 13: the client id is read at run time, so the image needs no rebuild when it arrives.
  const config = useQuery({ queryKey: ["admin", "auth-config"], queryFn: adminApi.authConfig, enabled: !session });
  if (session) {
    return (
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:userId" element={<UserPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="engine-health" element={<EngineHealthPage />} />
          {/* PAD-533: clubs and switches */}
          <Route path="clubs" element={<ClubsPage />} />
          <Route path="clubs/:clubId" element={<ClubPage />} />
          <Route path="switches" element={<SwitchesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }
  if (config.isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("admin.common.loading")}</p>;
  if (config.isError) return <p className="p-6 text-sm text-destructive">{t("admin.signIn.error.NETWORK")}</p>;
  if (!config.data?.configured) return <NotConfiguredPage onRetry={() => void config.refetch()} />;
  return <SignInPage config={config.data} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
