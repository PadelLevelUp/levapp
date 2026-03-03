import type { Player, CoachPlayer, PlayerProfile, CoachNote } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockPlayers, mockCoachPlayers, mockPlayerProfiles } from "@/data/mockData";

export async function getPlayers(): Promise<Player[]> {
  if (USE_MOCK_DATA) {
    return mockPlayers;
  }

  const res = await api.get("/app/players");
  return res.data;
}

export async function getCoachPlayers(): Promise<CoachPlayer[]> {
  if (USE_MOCK_DATA) {
    return mockCoachPlayers;
  }

  const res = await api.get("/app/coach_players");
  return res.data;
}

export async function addPlayer(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addPlayer", data);
    return { id: crypto.randomUUID(), ...data };
  }

  const res = await api.post("/app/add_player", data);
  return res.data;
}

export async function editPlayer(player: CoachPlayer, updates: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] editPlayer", player.id, updates);
    return { ...player, ...updates };
  }

  const res = await api.post("/app/edit_player", { player, updates });
  return res.data;
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  if (USE_MOCK_DATA) {
    return mockPlayerProfiles[playerId] ?? null;
  }
  const res = await api.get(`/app/player_profile/${playerId}`);
  return res.data;
}

export async function addCoachNote(playerId: string, type: "strength" | "weakness", text: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addCoachNote", { playerId, type, text });
    return;
  }
  await api.post("/app/add_coach_note", { playerId, type, text });
}

export async function deleteCoachNote(note: CoachNote): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteCoachNote", note);
    return;
  }
  await api.post("/app/delete/coach_note", { id: note.id });
}