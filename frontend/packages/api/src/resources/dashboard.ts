import type { DashboardDefinition } from "@levelup/types";
import { getApi } from "../client";

export async function getDashboard(params?: {
  from?: string;
  to?: string;
}): Promise<DashboardDefinition> {
  const res = await getApi().get("/app/dashboard", {
    params: {
      from: params?.from,
      to: params?.to,
    },
  });
  return res.data;
}

/**
 * PAD-78: fire an extra manual notification to every student still pending
 * confirmation for tomorrow's classes. Returns how many were notified.
 */
export async function notifyPendingConfirmations(): Promise<{
  instances: number;
  sent: number;
}> {
  const res = await getApi().post("/app/dashboard/pending-confirmations/notify");
  return res.data;
}

/**
 * "Later" on an empty-seats card (dashboard.blocks rule 3c). The item leaves
 * the coach's needs-you queue for 24 hours, on every device, then comes back
 * on its own. Returns the deadline.
 */
export async function snoozeNeedsYouItem(itemId: string): Promise<{
  itemId: string;
  snoozedUntil: string;
}> {
  const res = await getApi().post(
    `/app/dashboard/needs-you/${encodeURIComponent(itemId)}/snooze`,
  );
  return res.data;
}
