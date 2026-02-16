import type { CoachLevel } from "@/types";
import { api } from "@/api/client";

export async function getCoachLevels(): Promise<CoachLevel[]> {
  const res = await api.get("/api/app/coach_levels");
  return res.data;
}
