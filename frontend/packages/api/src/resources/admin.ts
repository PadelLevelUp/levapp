import { getApi } from "../client";

/**
 * auth.coach-approval rules 2–3: the LevApp admin (superadmin) surface. Every
 * call here is 403 for anyone else — the client only decides whether to show
 * the section, never whether to trust the answer.
 */

export type PendingCoach = {
  coachId: number;
  userId: number;
  name: string;
  username: string;
  email: string | null;
  /** auth.email-verification rule 10: false means nobody can reach this coach yet. */
  emailVerified?: boolean;
  requestedAt: string;
};

export async function listPendingCoaches(): Promise<PendingCoach[]> {
  const res = await getApi().get("/app/admin/coach-approvals");
  return res.data;
}

export async function approveCoach(coachId: number): Promise<void> {
  await getApi().post(`/app/admin/coach-approvals/${coachId}/approve`);
}

/**
 * auth.coach-approval rule 9 (PAD-238 item 3 via PAD-279): the operator
 * settings. `source` says whether the value comes from an `app_settings` row
 * the admin wrote or from the server's environment default.
 */
export type AdminSettings = {
  coachApprovalRequired: boolean;
  source: "database" | "environment";
};

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await getApi().get("/app/admin/settings");
  return res.data;
}

export async function updateAdminSettings(
  patch: Partial<Pick<AdminSettings, "coachApprovalRequired">>,
): Promise<AdminSettings> {
  const res = await getApi().put("/app/admin/settings", patch);
  return res.data;
}

export async function rejectCoach(coachId: number, reason?: string): Promise<void> {
  await getApi().post(`/app/admin/coach-approvals/${coachId}/reject`, {
    reason: reason ?? null,
  });
}
