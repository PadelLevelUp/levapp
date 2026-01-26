import type { Player, CoachPlayer } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

export async function getPlayers(coachId: string): Promise<Player[]> {
  const res = await fetch(
    `${API_URL}/api/app/players?coach_id=${coachId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getCoachPlayers(
  coachId: string
): Promise<CoachPlayer[]> {
  const res = await fetch(
    `${API_URL}/api/app/coach_players?coach_id=${coachId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}