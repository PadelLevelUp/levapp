import type { CoachLevel } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

export async function getCoachLevels(
  coachId: string
): Promise<CoachLevel[]> {
  const res = await fetch(
    `${API_URL}/api/app/coach_levels?coach_id=${coachId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}