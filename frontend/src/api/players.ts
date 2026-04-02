import type { Player, CoachPlayer, PlayerProfile, CoachNote } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockPlayers, mockCoachPlayers, mockPlayerProfiles } from "@/data/mockData";

const COACH_PLAYERS_CACHE_TTL_MS = 60_000;

type CoachPlayersCacheEntry = {
  data: CoachPlayer[];
  expiresAt: number;
};

type CoachPlayersPageCacheEntry = {
  data: CoachPlayersPageResponse;
  expiresAt: number;
};

const coachPlayersCache: {
  full: CoachPlayersCacheEntry | null;
  pages: Map<string, CoachPlayersPageCacheEntry>;
} = {
  full: null,
  pages: new Map(),
};

export interface CoachPlayersPageResponse {
  items: CoachPlayer[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  alerts?: {
    missingLevel: number;
    missingSide: number;
  };
}

export interface PlayersQueryParams {
  page?: number;
  perPage?: number;
  search?: string;
  sortBy?: "name" | "level";
  sortDir?: "asc" | "desc";
  missingLevel?: boolean;
  missingSide?: boolean;
}

function isFresh(expiresAt: number): boolean {
  return Date.now() < expiresAt;
}

export function invalidateCoachPlayersCache(): void {
  coachPlayersCache.full = null;
  coachPlayersCache.pages.clear();
}

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

  if (coachPlayersCache.full && isFresh(coachPlayersCache.full.expiresAt)) {
    return coachPlayersCache.full.data;
  }

  const res = await api.get("/app/coach_players");
  coachPlayersCache.full = {
    data: res.data,
    expiresAt: Date.now() + COACH_PLAYERS_CACHE_TTL_MS,
  };
  return res.data;
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

  const hasFilters = !!search || !!missingLevel || !!missingSide ||
    (sortBy && sortBy !== "name") || (sortDir && sortDir !== "asc");

  // Skip cache when any filter/sort is active
  if (!hasFilters) {
    const key = `${page}:${perPage}`;
    const cached = coachPlayersCache.pages.get(key);
    if (cached && isFresh(cached.expiresAt)) {
      return cached.data;
    }
  }

  const params: Record<string, string | number> = { page, per_page: perPage };
  if (search) params.search = search;
  if (sortBy) params.sort_by = sortBy;
  if (sortDir) params.sort_dir = sortDir;
  if (missingLevel) params.missing_level = "true";
  if (missingSide) params.missing_side = "true";

  const res = await api.get("/app/coach_players_paginated", { params });
  const payload = res.data as CoachPlayersPageResponse;
  if (!hasFilters) {
    const key = `${page}:${perPage}`;
    coachPlayersCache.pages.set(key, {
      data: payload,
      expiresAt: Date.now() + COACH_PLAYERS_CACHE_TTL_MS,
    });
  }
  return payload;
}

export async function addPlayer(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addPlayer", data);
    return { id: crypto.randomUUID(), ...data };
  }

  const res = await api.post("/app/add_player", data);
  invalidateCoachPlayersCache();
  return res.data;
}

export async function editPlayer(player: CoachPlayer, updates: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] editPlayer", player.id, updates);
    return { ...player, ...updates };
  }

  const res = await api.post("/app/edit_player", { player, updates });
  invalidateCoachPlayersCache();
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
