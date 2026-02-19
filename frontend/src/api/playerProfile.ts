import type { PlayerProfile } from "@/types";
import { USE_MOCK_DATA } from "@/config";
import { mockPlayerProfiles } from "@/data/mockData";
import { api } from "@/api/client";

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  if (USE_MOCK_DATA) {
    return mockPlayerProfiles[playerId] ?? null;
  }

  const res = await api.get(`/app/player_profile/${playerId}`);
  return res.data;
}
