import { lazyWithReload } from "@/lib/lazyWithReload";

/**
 * client.route-loading rules 1 and 3 (PAD-585): the only place the app imports a page.
 *
 * Each page is its own chunk. `App.tsx` and `HomeRoute.tsx` render these components and import
 * no page module directly (pinned by `src/test/route-splitting.test.ts`). The loaders are shared
 * between `React.lazy` and `prefetchAppPages`, so a prefetched chunk is the same chunk the route
 * renders.
 */
const loaders = {
  AbsencesPage: () => import("@/pages/AbsencesPage"),
  AttendancePage: () => import("@/pages/AttendancePage"),
  AuthPage: () => import("@/pages/AuthPage"),
  AvailabilityPage: () => import("@/pages/AvailabilityPage"),
  CalendarPage: () => import("@/pages/CalendarPage"),
  ClassRequestsPage: () => import("@/pages/ClassRequestsPage"),
  ClubOnboardingPage: () => import("@/pages/ClubOnboardingPage"),
  CoachInvitePage: () => import("@/pages/CoachInvitePage"),
  CoachPendingPage: () => import("@/pages/CoachPendingPage"),
  ConnectWithCoachPage: () => import("@/pages/ConnectWithCoachPage"),
  DashboardPage: () => import("@/pages/DashboardPage"),
  DeleteAccountPage: () => import("@/pages/DeleteAccountPage"),
  ForgotPasswordPage: () => import("@/pages/ForgotPasswordPage"),
  JoinCoachPage: () => import("@/pages/JoinCoachPage"),
  LandingPage: () => import("@/pages/LandingPage"),
  LegalPage: () => import("@/pages/LegalPage"),
  MessagesPage: () => import("@/pages/MessagesPage"),
  NotFound: () => import("@/pages/NotFound"),
  PlayerInvitePage: () => import("@/pages/PlayerInvitePage"),
  PlayersPage: () => import("@/pages/PlayersPage"),
  PresencesPage: () => import("@/pages/PresencesPage"),
  RegisterPage: () => import("@/pages/RegisterPage"),
  SettingsPage: () => import("@/pages/SettingsPage"),
  SignUpPage: () => import("@/pages/SignUpPage"),
  SocialSignUpCompletePage: () => import("@/pages/SocialSignUpCompletePage"),
  StudentEvaluations: () => import("@/pages/StudentEvaluations"),
  SupportPage: () => import("@/pages/SupportPage"),
  TrainingExercisesPage: () => import("@/pages/TrainingExercisesPage"),
  TrainingGroupsPage: () => import("@/pages/TrainingGroupsPage"),
  TrainingPage: () => import("@/pages/TrainingPage"),
  VerifyEmailPage: () => import("@/pages/VerifyEmailPage"),
  LegalCatchUpPage: () => import("@/pages/LegalCatchUpPage"),
  ViewAsPage: () => import("@/pages/ViewAsPage"),
} as const;

export type PageName = keyof typeof loaders;

/** Pages reachable from `AppLayout`'s menu: prefetched once a signed-in screen is up (rule 3). */
export const MENU_PAGES: readonly PageName[] = [
  "DashboardPage",
  "CalendarPage",
  "PlayersPage",
  "TrainingPage",
  "PresencesPage",
  "AvailabilityPage",
  "ClassRequestsPage",
  "MessagesPage",
  "SettingsPage",
];

export const AbsencesPage = lazyWithReload(loaders.AbsencesPage);
export const AttendancePage = lazyWithReload(loaders.AttendancePage);
export const AuthPage = lazyWithReload(loaders.AuthPage);
export const AvailabilityPage = lazyWithReload(loaders.AvailabilityPage);
export const CalendarPage = lazyWithReload(loaders.CalendarPage);
export const ClassRequestsPage = lazyWithReload(loaders.ClassRequestsPage);
export const ClubOnboardingPage = lazyWithReload(loaders.ClubOnboardingPage);
export const CoachInvitePage = lazyWithReload(loaders.CoachInvitePage);
export const CoachPendingPage = lazyWithReload(loaders.CoachPendingPage);
export const ConnectWithCoachPage = lazyWithReload(loaders.ConnectWithCoachPage);
export const DashboardPage = lazyWithReload(loaders.DashboardPage);
export const ForgotPasswordPage = lazyWithReload(loaders.ForgotPasswordPage);
export const JoinCoachPage = lazyWithReload(loaders.JoinCoachPage);
export const LandingPage = lazyWithReload(loaders.LandingPage);
export const LegalPage = lazyWithReload(loaders.LegalPage);
export const MessagesPage = lazyWithReload(loaders.MessagesPage);
export const NotFound = lazyWithReload(loaders.NotFound);
export const PlayerInvitePage = lazyWithReload(loaders.PlayerInvitePage);
export const PlayersPage = lazyWithReload(loaders.PlayersPage);
export const PresencesPage = lazyWithReload(loaders.PresencesPage);
export const RegisterPage = lazyWithReload(loaders.RegisterPage);
export const SettingsPage = lazyWithReload(loaders.SettingsPage);
export const SignUpPage = lazyWithReload(loaders.SignUpPage);
export const SocialSignUpCompletePage = lazyWithReload(loaders.SocialSignUpCompletePage);
export const StudentEvaluations = lazyWithReload(loaders.StudentEvaluations);
export const SupportPage = lazyWithReload(loaders.SupportPage);
export const DeleteAccountPage = lazyWithReload(loaders.DeleteAccountPage);
export const TrainingExercisesPage = lazyWithReload(loaders.TrainingExercisesPage);
export const TrainingGroupsPage = lazyWithReload(loaders.TrainingGroupsPage);
export const TrainingPage = lazyWithReload(loaders.TrainingPage);
export const VerifyEmailPage = lazyWithReload(loaders.VerifyEmailPage);
export const LegalCatchUpPage = lazyWithReload(loaders.LegalCatchUpPage);
export const ViewAsPage = lazyWithReload(loaders.ViewAsPage);

const prefetched = new Set<PageName>();

/**
 * Rule 3: fetch the menu pages' chunks in the background, each at most once per page load.
 * A failed prefetch is ignored; the route's own load retries (and reloads once, rule 4).
 * `load` is injectable for tests.
 */
export function prefetchAppPages(load: (name: PageName) => Promise<unknown> = (name) => loaders[name]()): void {
  for (const name of MENU_PAGES) {
    if (prefetched.has(name)) continue;
    prefetched.add(name);
    load(name).catch(() => prefetched.delete(name));
  }
}

/** Test seam: forget which pages were prefetched. */
export function resetPrefetchedPagesForTest(): void {
  prefetched.clear();
}

/** Schedules `prefetchAppPages` when the browser is idle (1 s timeout where idle callbacks are missing). */
export function schedulePagePrefetch(): () => void {
  // Unit tests mount AppLayout for seconds at a time; importing every page there would load
  // modules the test never mocked. prefetchAppPages itself is tested directly.
  if (import.meta.env.MODE === "test") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => prefetchAppPages(), { timeout: 5_000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(() => prefetchAppPages(), 1_000);
  return () => window.clearTimeout(id);
}
