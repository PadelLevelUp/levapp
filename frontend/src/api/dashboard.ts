import type { DashboardDefinition } from "@/types";
import { api } from "@/api/client";

export async function getDashboard(params?: { from?: string; to?: string }): Promise<DashboardDefinition> {
  const res = await api.get("/api/app/dashboard", {
    params: {
      from: params?.from,
      to: params?.to,
    },
  });
  return res.data;
}