import type { authApi } from "@levelup/api";

type Me = authApi.MeResponse;

/**
 * auth.register rule 11 — where a signed-in user belongs. Mirrors web's
 * `apps/web/src/auth/postLoginPath.ts`; keep the two in step.
 *
 * A coach is routed by `coachApproval` first, then by `clubs`. A missing
 * `coachApproval` is treated as approved (pre-gate coaches were backfilled).
 *
 * TODO(slice C, players.join-token rule 8): a student with no coach should land
 * on `/connect`; `/auth/me` does not say yet, so students go to the tabs and
 * only a brand-new signup is sent to `/connect` by the signup screen.
 */
export type PostLoginRoute = "/(tabs)/dashboard" | "/coach-pending" | "/club-onboarding";

export function postLoginRoute(user: Me | null | undefined): PostLoginRoute {
  if (!user) return "/(tabs)/dashboard";
  const isCoach = user.roles?.includes("coach") ?? false;
  if (!isCoach) return "/(tabs)/dashboard";

  const approval = user.coachApproval ?? "approved";
  if (approval !== "approved") return "/coach-pending";
  if ((user.clubs?.length ?? 0) === 0) return "/club-onboarding";
  return "/(tabs)/dashboard";
}
