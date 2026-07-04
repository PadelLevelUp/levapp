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
