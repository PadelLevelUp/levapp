import type { Player, CoachPlayer } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockPlayers, mockCoachPlayers } from "@/data/mockData";

export async function getPlayers(): Promise<Player[]> {
  if (USE_MOCK_DATA) {
    return mockPlayers;
  }

  const res = await api.get("/api/app/players");
  return res.data;
}

export async function getCoachPlayers(): Promise<CoachPlayer[]> {
  if (USE_MOCK_DATA) {
    return mockCoachPlayers;
  }

  const res = await api.get("/api/app/coach_players");
  return res.data;
}

export async function addPlayer(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addPlayer", data);
    return { id: crypto.randomUUID(), ...data };
  }

  const res = await api.post("/api/app/add_player", data);
  return res.data;
}

export async function editPlayer(player: CoachPlayer, updates: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] editPlayer", player.id, updates);
    return { ...player, ...updates };
  }

  const res = await api.post("/api/app/edit_player", { player, updates });
  return res.data;
}
