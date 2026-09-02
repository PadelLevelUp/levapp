import "@/api/client";
import type { Player, CoachPlayer, PlayerProfile, CoachNote } from "@/types";
import * as playersApi from "@levelup/api/src/resources/players";
import { USE_MOCK_DATA } from "@/config";
import { mockPlayers, mockCoachPlayers, mockPlayerProfiles } from "@/data/mockData";

export type {
  CoachPlayersPageResponse,
  PlayersQueryParams,
} from "@levelup/api/src/resources/players";
import type { CoachPlayersPageResponse } from "@levelup/api/src/resources/players";

export { invalidateCoachPlayersCache } from "@levelup/api/src/resources/players";

export async function getPlayers(): Promise<Player[]> {
  if (USE_MOCK_DATA) {
    return mockPlayers;
  }

  return playersApi.getPlayers();
}

export async function getCoachPlayers(): Promise<CoachPlayer[]> {
  if (USE_MOCK_DATA) {
    return mockCoachPlayers;
  }

  return playersApi.getCoachPlayers();
}

export async function getCoachPlayersPaginated(
  page = 1,
  perPage = 25,
  search?: string,
  sortBy?: "name" | "level",
  sortDir?: "asc" | "desc",
  missingLevel?: boolean,
  missingSide?: boolean,
): Promise<CoachPlayersPageResponse> {
  if (USE_MOCK_DATA) {
    let filtered = mockCoachPlayers;
    if (search) {
      const q = search.toLowerCase();
      filtered = mockCoachPlayers.filter((p) => (p.name ?? "").toLowerCase().includes(q));
    }
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);
    const pages = Math.max(1, Math.ceil(total / perPage));
    return {
      items,
      pagination: {
        page,
        perPage,
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1,
      },
    };
  }

  return playersApi.getCoachPlayersPaginated(
    page,
    perPage,
    search,
    sortBy,
    sortDir,
    missingLevel,
    missingSide,
  );
}

export async function addPlayer(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addPlayer", data);
    return { id: crypto.randomUUID(), ...data };
  }

  return playersApi.addPlayer(data);
}

export async function editPlayer(player: CoachPlayer, updates: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] editPlayer", player.id, updates);
    return { ...player, ...updates };
  }

  return playersApi.editPlayer(player, updates);
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  if (USE_MOCK_DATA) {
    return mockPlayerProfiles[playerId] ?? null;
  }
  return playersApi.getPlayerProfile(playerId);
}

export async function addCoachNote(playerId: string, type: "strength" | "weakness", text: string): Promise<CoachNote> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addCoachNote", { playerId, type, text });
    return { id: -Date.now(), text };
  }
  return playersApi.addCoachNote(playerId, type, text);
}

export async function deleteCoachNote(note: CoachNote): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteCoachNote", note);
    return;
  }
  await playersApi.deleteCoachNote(note);
}

export async function removePlayer(coachId: string, playerId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] removePlayer", { coachId, playerId });
    return;
  }
  await playersApi.removePlayer(coachId, playerId);
}
