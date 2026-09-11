import type { CoachPlayer, CoachNote, Player, PlayerProfile, PlayerRemovalAction, PlayerRemovalImpact } from "@levelup/types";
import { getApi } from "../client";

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
  const res = await getApi().get("/app/players");
  return res.data;
}

export async function getCoachPlayers(): Promise<CoachPlayer[]> {
  if (coachPlayersCache.full && isFresh(coachPlayersCache.full.expiresAt)) {
    return coachPlayersCache.full.data;
  }

  const res = await getApi().get("/app/coach_players");
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

  const res = await getApi().get("/app/coach_players_paginated", { params });
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
  const res = await getApi().post("/app/add_player", data);
  invalidateCoachPlayersCache();
  return res.data;
}

export async function editPlayer(player: CoachPlayer, updates: any) {
  const res = await getApi().post("/app/edit_player", { player, updates });
  invalidateCoachPlayersCache();
  return res.data;
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const res = await getApi().get(`/app/player_profile/${playerId}`);
  return res.data;
}

export async function addCoachNote(playerId: string, type: "strength" | "weakness", text: string): Promise<CoachNote> {
  const res = await getApi().post("/app/add_coach_note", { playerId, type, text });
  // The backend returns the persisted note's real numeric id; surface it so the
  // caller can key the optimistic row with it instead of a temp id (PAD-101).
  return { id: res.data.id, text: res.data.text ?? text };
}

export async function deleteCoachNote(note: CoachNote): Promise<void> {
  await getApi().post("/app/delete/coach_note", { id: note.id });
}

/**
 * players.remove (PAD-274): `disconnect` from a student, or `delete` an
 * unclaimed placeholder. A `delete` of anyone with an account is refused with
 * 409 `PLAYER_HAS_ACCOUNT` (see `removePlayerErrorCode`).
 */
export async function removePlayer(
  coachId: string,
  playerId: string,
  action?: PlayerRemovalAction,
): Promise<void> {
  await getApi().post("/app/remove_player", action ? { coachId, playerId, action } : { coachId, playerId });
  invalidateCoachPlayersCache();
}

/** players.remove rule 7: which removal this coach gets, and what it takes. */
export async function getPlayerRemovalImpact(playerId: string): Promise<PlayerRemovalImpact> {
  const res = await getApi().get(`/app/player/${playerId}/removal_impact`);
  return res.data;
}

export type RemovePlayerErrorCode = "PLAYER_HAS_ACCOUNT" | "PLAYER_HAS_OTHER_COACHES" | "INVALID_ACTION";

/** The refusal code of a failed `removePlayer`, or null for any other failure. */
export function removePlayerErrorCode(err: unknown): RemovePlayerErrorCode | null {
  const data = (err as { response?: { data?: unknown } } | null)?.response?.data;
  const code = data && typeof data === "object" ? (data as { code?: unknown }).code : undefined;
  return code === "PLAYER_HAS_ACCOUNT" || code === "PLAYER_HAS_OTHER_COACHES" || code === "INVALID_ACTION"
    ? code
    : null;
}
