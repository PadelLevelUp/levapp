import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "next-themes";
import i18n from "@/i18n";

import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import PlayersPage from "./pages/PlayersPage";
import PlayerDetailPage from "./pages/PlayerDetailPage";
import AttendancePage from "./pages/AttendancePage";
import AbsencesPage from "./pages/AbsencesPage";
import PresencesPage from "./pages/PresencesPage";
import RegisterPage from "./pages/RegisterPage";
import CoachInvitePage from "./pages/CoachInvitePage";
import PlayerInvitePage from "./pages/PlayerInvitePage";
import AuthPage from "./pages/AuthPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import CoachPendingPage from "./pages/CoachPendingPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ClubOnboardingPage from "./pages/ClubOnboardingPage";
import ConnectWithCoachPage from "./pages/ConnectWithCoachPage";
import JoinCoachPage from "@/pages/JoinCoachPage";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import SupportPage from "./pages/SupportPage";
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
import { LaunchOverlayProvider } from "@/components/brand/launch-overlay";
import { HomeRoute } from "@/auth/HomeRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
  <I18nextProvider i18n={i18n}>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <LayoutProvider>
          <BrowserRouter>
            <LaunchOverlayProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              {/* auth.register — self-service signup (PAD-210). */}
              <Route path="/signup" element={<SignUpPage />} />
              {/* auth.password-recovery — public, reached from "Forgot your password?" (PAD-139). */}
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/register/:userId" element={<RegisterPage />} />
              <Route path="/invite/coach/:token" element={<CoachInvitePage />} />
              <Route path="/invite/player/:token" element={<PlayerInvitePage />} />
              {/* players.join-token rule 9 — public: the preview needs no session. */}
              <Route path="/join/coach/:token" element={<JoinCoachPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/support" element={<SupportPage />} />

              {/* `/` is the public page when there is no session and the
                  dashboard when there is — see HomeRoute. */}
              <Route path="/" element={<HomeRoute />} />

              {/* Post-signup holding screens (auth.register rule 11). They are
                  protected (a session is needed) but exempt from the
                  approved-coach redirect ProtectedRoute applies elsewhere. */}
              <Route
                path="/verify-email"
                element={
                  <ProtectedRoute>
                    <VerifyEmailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/coach-pending"
                element={
                  <ProtectedRoute>
                    <CoachPendingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/club-onboarding"
                element={
                  <ProtectedRoute>
                    <ClubOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/connect"
                element={
                  <ProtectedRoute>
                    <ConnectWithCoachPage />
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

              {/* PAD-114 — "Presenças". One page, two entry points. The role
                  guards here are UX only: `GET /attendance_history`
                  re-authorizes the subject server-side (spec
                  `attendance.history` rule 3), so a coach cannot read a player
                  off their roster by typing the URL. */}
              <Route
                path="/players/:playerId/attendance"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <AttendancePage />
                  </RoleRoute>
                }
              />

              <Route
                path="/attendance"
                element={
                  <RoleRoute allowedRoles={["player"]}>
                    <AttendancePage />
                  </RoleRoute>
                }
              />

              {/* PAD-141 — "Faltas", the counterpart of the two routes above.
                  Same guard rationale: `GET /absence_history` re-authorizes the
                  subject server-side (spec `attendance.absences` rule 4), so
                  these guards are UX only. */}
              <Route
                path="/players/:playerId/absences"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <AbsencesPage />
                  </RoleRoute>
                }
              />

              <Route
                path="/absences"
                element={
                  <RoleRoute allowedRoles={["player"]}>
                    <AbsencesPage />
                  </RoleRoute>
                }
              />

              {/* PAD-140 — the coach's attendance overview. Coach-only: the
                  three endpoints behind it expose every roster player's
                  presence data, which `classes.detail-visibility` keeps away
                  from students. The guard here is UX; each endpoint re-checks
                  with `require_coach()` server-side. */}
              <Route
                path="/presences"
                element={
                  <RoleRoute allowedRoles={["coach"]}>
                    <PresencesPage />
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
            </LaunchOverlayProvider>
          </BrowserRouter>
        </LayoutProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </I18nextProvider>
  </ThemeProvider>
);

export default App;
