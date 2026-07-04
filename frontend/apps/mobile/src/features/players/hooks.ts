import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as playersApi from "@levelup/api/src/resources/players";
import { queryKeys } from "@levelup/hooks";
import type { CoachNote, CoachPlayer } from "@levelup/types";

/**
 * Feature-local hooks for the Players screens. Query hooks that already exist
 * in @levelup/hooks (useCoachPlayersPaginated, usePlayerProfile,
 * useCoachLevels) are used directly from there — this module adds the missing
 * pieces: the unpaginated roster lookup and the player/note mutations.
 */

/** Prefix key that matches every page/filter variant of the paginated list. */
const COACH_PLAYERS_PAGINATED_PREFIX = ["coach-players-paginated"] as const;

export const coachPlayersKey = ["coach-players"] as const;

/** Full (unpaginated) roster — used by the detail screen to find one player. */
export function useCoachPlayers() {
  return useQuery({
    queryKey: coachPlayersKey,
    queryFn: playersApi.getCoachPlayers,
  });
}

/** Invalidate every players-related query (lists + optional profile). */
function usePlayersInvalidation() {
  const queryClient = useQueryClient();
  return (playerId?: string | number) => {
    void queryClient.invalidateQueries({
      queryKey: COACH_PLAYERS_PAGINATED_PREFIX,
    });
    void queryClient.invalidateQueries({ queryKey: coachPlayersKey });
    if (playerId != null) {
      // The API serializes playerId as a number while route params are
      // strings — normalize so the invalidation matches the active query key.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.playerProfile(String(playerId)),
      });
    }
  };
}

/** Payload for POST /app/add_player — mirrors the web AddPlayerSheet. */
export interface AddPlayerPayload {
  coachId?: string | null;
  name: string;
  isActive: boolean;
  username?: string;
  email?: string;
  phone?: string;
  levelId?: string;
  side?: string;
  notes?: string;
}

export function useAddPlayer() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: (payload: AddPlayerPayload) => playersApi.addPlayer(payload),
    onSuccess: () => invalidate(),
  });
}

/** Updates for POST /app/edit_player — mirrors the web PlayerDetailPage. */
export interface EditPlayerUpdates {
  name?: string;
  username?: string;
  userId?: string;
  email?: string;
  phone?: string;
  levelId?: string;
  side?: string;
  notes?: string;
}

export function useEditPlayer() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: ({
      player,
      updates,
    }: {
      player: CoachPlayer;
      updates: EditPlayerUpdates;
    }) => playersApi.editPlayer(player, updates),
    onSuccess: (_data, variables) => invalidate(variables.player.playerId),
  });
}

export function useRemovePlayer() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: ({
      coachId,
      playerId,
    }: {
      coachId: string;
      playerId: string;
    }) => playersApi.removePlayer(coachId, playerId),
    onSuccess: () => invalidate(),
  });
}

export function useAddCoachNote() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: ({
      playerId,
      type,
      text,
    }: {
      playerId: string;
      type: "strength" | "weakness";
      text: string;
    }) => playersApi.addCoachNote(playerId, type, text),
    onSuccess: (_data, variables) => invalidate(variables.playerId),
  });
}

export function useDeleteCoachNote() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: ({ note }: { playerId: string; note: CoachNote }) =>
      playersApi.deleteCoachNote(note),
    onSuccess: (_data, variables) => invalidate(variables.playerId),
  });
}
