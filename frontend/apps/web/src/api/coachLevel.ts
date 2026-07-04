import "@/api/client";
import type { CoachLevel } from "@/types";
import * as coachLevelApi from "@levelup/api/src/resources/coachLevel";
import { USE_MOCK_DATA } from "@/config";
import { mockLevels } from "@/data/mockData";

export async function getCoachLevels(): Promise<CoachLevel[]> {
  if (USE_MOCK_DATA) {
    return mockLevels;
  }

  return coachLevelApi.getCoachLevels();
}

export async function addCoachLevel(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addCoachLevel", data);
    return { id: crypto.randomUUID(), ...data };
  }

  return coachLevelApi.addCoachLevel(data);
}

export async function deleteCoachLevel(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteCoachLevel", id);
    return;
  }
  await coachLevelApi.deleteCoachLevel(id);
}
