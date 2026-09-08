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
export type PostLoginRoute = "/(tabs)/dashboard" | "/verify-email" | "/coach-pending" | "/club-onboarding";

/**
 * auth.email-verification rule 8: a `pending` email (self-signup, or a new
 * address saved in Settings) holds everyone on the code screen before any
 * other routing. `unverified` and an absent field never hold.
 */
export function needsEmailVerification(user: Me | null | undefined): boolean {
  return user?.emailVerification === "pending";
}
export type PostLoginLanding = PostLoginRoute | "/connect";

/**
 * Where a user LANDS after login / signup: `postLoginRoute` plus the student
 * rule — no coach yet (`me.coaches` empty) → Connect with a coach
 * (players.join-token rule 8, PAD-225). Not used by the tab-layout guard, so a
 * student can still open Messages or Settings afterwards.
 */
export function postLoginLanding(user: Me | null | undefined): PostLoginLanding {
  const held = postLoginRoute(user);
  if (held !== "/(tabs)/dashboard") return held;
  const isCoach = user?.roles?.includes("coach") ?? false;
  if (!isCoach && Array.isArray(user?.coaches) && user.coaches.length === 0) return "/connect";
  return "/(tabs)/dashboard";
}

export function postLoginRoute(user: Me | null | undefined): PostLoginRoute {
  if (!user) return "/(tabs)/dashboard";
  if (needsEmailVerification(user)) return "/verify-email";
  const isCoach = user.roles?.includes("coach") ?? false;
  if (!isCoach) return "/(tabs)/dashboard";

  const approval = user.coachApproval ?? "approved";
  if (approval !== "approved") return "/coach-pending";
  if ((user.clubs?.length ?? 0) === 0) return "/club-onboarding";
  return "/(tabs)/dashboard";
}
