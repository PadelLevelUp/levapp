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
 * TODO(slice C, players.join-token rule 8): a student with no coach should land
 * on `/connect`. Nothing in `/auth/me` says whether a student has a coach yet,
 * so every student goes to the dashboard for now; SignUpPage sends a
 * brand-new student to `/connect` explicitly, which is the case that matters.
 */
export function postLoginPath(user: MeResponse | null | undefined): string {
  if (!user) return "/dashboard";
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
