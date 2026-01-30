import type { Player, CoachPlayer } from "@/types";
import { api } from "@/api/client";

export async function getPlayers(): Promise<Player[]> {
  const res = await api.get("/api/app/players");
  return res.data;
}

export async function getCoachPlayers(): Promise<CoachPlayer[]> {
  const res = await api.get("/api/app/coach_players");
  return res.data;
}

export async function addPlayer(data: any) {
  const res = await api.post("/api/app/add_player", data);
  return res.data;
}

export async function editPlayer(
  player: CoachPlayer,
  updates: any
) {
  const res = await api.post("/api/app/edit_player", {
    player,
    updates,
  });

  return res.data;
}

export async function removePlayer(
  coachId: string,
  playerId: string
) {
  const res = await api.post("/api/app/remove_player", {
    coachId,
    playerId,
  });

  return res.data;
}
