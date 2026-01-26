import type { DashboardStats } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/app/dashboard`);
  return res.json();
}
