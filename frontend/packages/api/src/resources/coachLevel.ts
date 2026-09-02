import type { CoachLevel } from "@levelup/types";
import { getApi } from "../client";

export async function getCoachLevels(): Promise<CoachLevel[]> {
  const res = await getApi().get("/app/coach_levels");
  return res.data;
}

export async function addCoachLevel(data: any) {
  const res = await getApi().post(`/app/add_coach_level`, data);
  return res.data;
}

export async function deleteCoachLevel(id: string): Promise<void> {
  await getApi().post("/app/delete/coach_level", { id: id });
}
