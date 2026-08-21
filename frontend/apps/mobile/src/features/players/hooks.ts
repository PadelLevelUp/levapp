import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as playersApi from "@levelup/api/src/resources/players";
import * as playerInvitationsApi from "@levelup/api/src/resources/playerInvitations";
import * as evaluationApi from "@levelup/api/src/resources/evaluation";
import * as notificationEngineApi from "@levelup/api/src/resources/notificationEngine";
import * as classesApi from "@levelup/api/src/resources/classes";
import { queryKeys } from "@levelup/hooks";
import type {
  CalendarEvent,
  CoachNote,
  CoachPlayer,
  EvaluationEntryPayload,
} from "@levelup/types";

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

/** Payload for POST /app/add_player — mirrors the web AddPlayerSheet.
 *  PAD-105: no `username` — the player picks their own at activation. */
export interface AddPlayerPayload {
  coachId?: string | null;
  name: string;
  isActive: boolean;
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

/**
 * PAD-135: the "create & invite" counterpart of useAddPlayer.
 *
 * POST /app/incomplete_player creates the player *and* a single-use
 * PlayerInvitation, returning the shareable link. `addPlayer` (POST
 * /app/add_player) never returns a token, which is why the mobile create
 * screen had no link to show — it was calling the wrong endpoint.
 *
 * Note the payload has no `phone`: the invited player supplies their own
 * contact details when they complete the profile, so the backend's
 * incomplete-player payload deliberately omits it (see
 * CreateIncompletePlayerPayload).
 */
export function useCreateIncompletePlayer() {
  const invalidate = usePlayersInvalidation();
  return useMutation({
    mutationFn: (payload: playerInvitationsApi.CreateIncompletePlayerPayload) =>
      playerInvitationsApi.createIncompletePlayer(payload),
    onSuccess: () => invalidate(),
  });
}

/** Updates for POST /app/edit_player — mirrors the web PlayerDetailPage. */
export interface EditPlayerUpdates {
  name?: string;
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

// ── Evaluations ──

export const evaluationCategoriesKey = ["evaluation-categories"] as const;

/**
 * Lazy-friendly by design: pass `enabled: true` only once the "Add
 * Evaluation" sheet is opened, mirroring web's `handleOpenEval`
 * (`PlayerDetailPage.tsx`), which fetches categories on first open rather
 * than eagerly on mount.
 */
export function useEvaluationCategories(enabled: boolean) {
  return useQuery({
    queryKey: evaluationCategoriesKey,
    queryFn: evaluationApi.getEvaluationCategories,
    enabled,
  });
}

export function usePostEvaluationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EvaluationEntryPayload) =>
      evaluationApi.postEvaluationEntry(payload),
    onSuccess: (_data, variables) => {
      // The player-detail screen reads evaluations off the player-profile
      // query (`profile.evaluations`, see [playerId].tsx), same as web
      // reads `profile?.evaluations` — invalidate that key so the new
      // entry shows up.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.playerProfile(String(variables.playerId)),
      });
    },
  });
}

// ── Standing waiting list ──

export const standingWaitingListKey = ["standing-waiting-list"] as const;

/**
 * Full list — web has no per-player lookup endpoint either; it fetches this
 * same list and does `list.find(e => e.playerId === player.playerId)` to
 * determine whether a player already has a standing entry
 * (`PlayerDetailPage.tsx`). Do the same `.find()` against this hook's data
 * on the mobile screen.
 */
export function useStandingWaitingList() {
  return useQuery({
    queryKey: standingWaitingListKey,
    queryFn: notificationEngineApi.getStandingWaitingList,
  });
}

export function useAddToStandingWaitingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playerId,
      credits,
      durationDays,
    }: {
      playerId: number;
      credits: number;
      durationDays: number;
    }) =>
      notificationEngineApi.addToStandingWaitingList(
        playerId,
        credits,
        durationDays
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: standingWaitingListKey });
    },
  });
}

export function useRemoveFromStandingWaitingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      notificationEngineApi.removeFromStandingWaitingList(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: standingWaitingListKey });
    },
  });
}

// ── Add to Classes (groundwork) ──

/**
 * Class instances for a week — no equivalent exists yet in
 * `calendar/hooks.ts` (checked; that file only has class/attendance
 * mutations, no week-range query). Mirrors web's `AddToClassesDialog`,
 * which calls `getClassInstances(from, to)` with "yyyy-MM-dd" week bounds.
 *
 * Returns `CalendarEvent[]`, not `ClassInstance[]` — `getClassInstances`
 * hits `/app/lesson_instances`, which serializes CalendarEvent-shaped rows
 * (title/participantCount/model/originalId), not full ClassInstance objects.
 * Was mistyped for a while; see found_issues.md.
 */
export function useClassInstancesForWeek(
  from: string,
  to: string,
  enabled = true
) {
  return useQuery<CalendarEvent[]>({
    queryKey: ["class-instances-week", from, to] as const,
    queryFn: () => classesApi.getClassInstances(from, to),
    enabled,
  });
}
