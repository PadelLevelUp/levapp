import type { DashboardStats } from "@/types";
import { api } from "@/api/client";

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await api.get("/api/app/dashboard");
  return res.data;
}
