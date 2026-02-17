import type { CoachLevel } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockLevels } from "@/data/mockData";

export async function getCoachLevels(): Promise<CoachLevel[]> {
  if (USE_MOCK_DATA) {
    return mockLevels;
  }

  const res = await api.get("/app/coach_levels");
  return res.data;
}

export async function addCoachLevel(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addCoachLevel", data);
    return { id: crypto.randomUUID(), ...data };
  }

  const res = await api.post(`/app/add_coach_level`, data);
  return res.data;
}
