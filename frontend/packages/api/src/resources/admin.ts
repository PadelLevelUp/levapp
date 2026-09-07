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
  requestedAt: string;
};

export async function listPendingCoaches(): Promise<PendingCoach[]> {
  const res = await getApi().get("/app/admin/coach-approvals");
  return res.data;
}

export async function approveCoach(coachId: number): Promise<void> {
  await getApi().post(`/app/admin/coach-approvals/${coachId}/approve`);
}

export async function rejectCoach(coachId: number, reason?: string): Promise<void> {
  await getApi().post(`/app/admin/coach-approvals/${coachId}/reject`, {
    reason: reason ?? null,
  });
}
