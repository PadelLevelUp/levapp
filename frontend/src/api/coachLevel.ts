import type { CoachLevel } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockLevels } from "@/data/mockData";

export async function getCoachLevels(): Promise<CoachLevel[]> {
  if (USE_MOCK_DATA) {
    return mockLevels;
  }

  const res = await api.get("/api/app/coach_levels");
  return res.data;
}
