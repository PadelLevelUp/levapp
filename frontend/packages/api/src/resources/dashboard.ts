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
