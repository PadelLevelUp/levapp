import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";

import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import PlayersPage from "./pages/PlayersPage";
import PlayerDetailPage from "./pages/PlayerDetailPage";
import RegisterPage from "./pages/RegisterPage";
import CoachInvitePage from "./pages/CoachInvitePage";
import PlayerInvitePage from "./pages/PlayerInvitePage";
import AuthPage from "./pages/AuthPage";
import SettingsPage from "./pages/SettingsPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import MessagesPage from "./pages/MessagesPage";
import NotFound from "./pages/NotFound";
import TrainingPage from "./pages/TrainingPage";
import TrainingExercisesPage from "./pages/TrainingExercisesPage";
import TrainingGroupsPage from "./pages/TrainingGroupsPage";
import EditorPage from "./pages/EditorPage";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { RoleRoute } from "@/auth/RoleRoute";
import { SuperAdminRoute } from "@/auth/SuperAdminRoute";
import { LayoutProvider } from "@/components/layout/LayoutContext";

const queryClient = new QueryClient();

const App = () => (
  <I18nextProvider i18n={i18n}>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <LayoutProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/register/:userId" element={<RegisterPage />} />
              <Route path="/invite/coach/:token" element={<CoachInvitePage />} />
              <Route path="/invite/player/:token" element={<PlayerInvitePage />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <CalendarPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/players"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <PlayersPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/players/:playerId"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <PlayerDetailPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/messages/:id"
                element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                  }
              />
              <Route
                path="/training"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <TrainingPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/training/exercises"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <TrainingExercisesPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/training/groups"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <TrainingGroupsPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/availability"
                element={
                  <RoleRoute allowedRoles={["player"]}>
                    <AvailabilityPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/editor"
                element={
                  <SuperAdminRoute>
                    <EditorPage />
                  </SuperAdminRoute>
                }
              />

              <Route
                path="/editor/:model"
                element={
                  <SuperAdminRoute>
                    <EditorPage />
                  </SuperAdminRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </LayoutProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </I18nextProvider>
);

export default App;
