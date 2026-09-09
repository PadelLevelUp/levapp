import type { MeResponse } from "@/api/auth";

/**
 * auth.register rule 11 — where a signed-in user belongs.
 *
 * A coach is routed by `coachApproval` first, then by `clubs`: pending or
 * rejected → the approval screen (they can sign in, but nothing club-scoped is
 * open to them, auth.coach-approval rule 8); approved with no club → club
 * onboarding (clubs.join-request rule 7); approved with a club → dashboard.
 * A missing `coachApproval` is treated as approved — every coach that existed
 * before the gate was backfilled to `approved`, and an older backend simply
 * omits the field.
 *
 * A student with no coach lands on `/connect` via `postLoginLanding` (PAD-225).
 */
/**
 * Where a user LANDS right after signing in / signing up. Same as
 * `postLoginPath`, plus one rule that must not apply to the route guards: a
 * student with no coach yet lands on Connect with a coach (players.join-token
 * rule 8, PAD-225). It is a landing, not a hold — the student may still open
 * Messages or Settings afterwards.
 */
export function postLoginLanding(user: MeResponse | null | undefined): string {
  const held = postLoginPath(user);
  if (held !== "/dashboard") return held;
  const isCoach = user?.roles?.includes("coach") ?? false;
  if (!isCoach && Array.isArray(user?.coaches) && user.coaches.length === 0) return "/connect";
  return "/dashboard";
}

/**
 * auth.email-verification rule 8: a `pending` email (self-signup, or a new
 * address saved in Settings) holds everyone — both roles — on the code
 * screen before any other routing. `unverified` (a coach-typed email) and an
 * absent field (older backend) never hold.
 */
export function needsEmailVerification(user: MeResponse | null | undefined): boolean {
  return user?.emailVerification === "pending";
}

export function postLoginPath(user: MeResponse | null | undefined): string {
  if (!user) return "/dashboard";
  if (needsEmailVerification(user)) return "/verify-email";
  const isCoach = user.roles?.includes("coach") ?? false;
  if (!isCoach) return "/dashboard";

  const approval = user.coachApproval ?? "approved";
  if (approval !== "approved") return "/coach-pending";
  if ((user.clubs?.length ?? 0) === 0) return "/club-onboarding";
  return "/dashboard";
}

/** True when the signed-in coach may use coach features at all. */
export function isApprovedCoach(user: MeResponse | null | undefined): boolean {
  if (!user?.roles?.includes("coach")) return false;
  return (user.coachApproval ?? "approved") === "approved";
}
