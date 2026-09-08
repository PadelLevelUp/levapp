import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type {
  CalendarEvent,
  ClassInstance,
  CoachLevel,
  Conversation,
  DashboardDefinition,
  Exercise,
  ExerciseGroup,
  ExerciseGroupPayload,
  ExercisePayload,
  PlayerProfile,
} from "@levelup/types";
import * as availabilityApi from "@levelup/api/src/resources/availability";
import * as calendarApi from "@levelup/api/src/resources/calendar";
import * as classesApi from "@levelup/api/src/resources/classes";
import * as coachLevelApi from "@levelup/api/src/resources/coachLevel";
import * as dashboardApi from "@levelup/api/src/resources/dashboard";
import * as messagesApi from "@levelup/api/src/resources/messages";
import * as playersApi from "@levelup/api/src/resources/players";
import * as trainingApi from "@levelup/api/src/resources/training";
import type { CoachPlayersPageResponse, PlayersQueryParams } from "@levelup/api/src/resources/players";
import type { AvailabilityBlocker } from "@levelup/api/src/resources/availability";
import { queryKeys } from "./queryKeys";

export type QueryOverrides<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

// ── Dashboard ──

export function useDashboard(
  params?: { from?: string; to?: string },
  options?: QueryOverrides<DashboardDefinition>
) {
  return useQuery({
    queryKey: queryKeys.dashboard(params),
    queryFn: () => dashboardApi.getDashboard(params),
    ...options,
  });
}

/**
 * Coach action: "Later" on a needs-you card. On success the dashboard is
 * invalidated so the card disappears because the payload says so — the
 * same way a student's reminder answer clears its row.
 */
export function useSnoozeNeedsYouItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => dashboardApi.snoozeNeedsYouItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ── Calendar ──

export function useCalendarEvents(
  from: string,
  to: string,
  options?: QueryOverrides<CalendarEvent[]>
) {
  return useQuery({
    queryKey: queryKeys.calendarEvents(from, to),
    queryFn: () => calendarApi.getCalendarEvents(from, to),
    ...options,
  });
}

export function useClassInstance(
  event: CalendarEvent | null | undefined,
  options?: QueryOverrides<ClassInstance>
) {
  return useQuery({
    queryKey: event
      ? queryKeys.classInstance(event)
      : ["class-instance", "none"],
    queryFn: () => classesApi.getClassInstance(event as CalendarEvent),
    enabled: !!event,
    ...options,
  });
}

// ── Players ──

export function useCoachPlayersPaginated(
  params: PlayersQueryParams = {},
  options?: QueryOverrides<CoachPlayersPageResponse>
) {
  return useQuery({
    queryKey: queryKeys.coachPlayersPaginated(params),
    queryFn: () =>
      playersApi.getCoachPlayersPaginated(
        params.page,
        params.perPage,
        params.search,
        params.sortBy,
        params.sortDir,
        params.missingLevel,
        params.missingSide
      ),
    ...options,
  });
}

export function usePlayerProfile(
  playerId: string | null | undefined,
  options?: QueryOverrides<PlayerProfile | null>
) {
  return useQuery({
    queryKey: queryKeys.playerProfile(playerId ?? "none"),
    queryFn: () => playersApi.getPlayerProfile(playerId as string),
    enabled: !!playerId,
    ...options,
  });
}

// ── Messages ──

export function useConversations(
  page = 1,
  limit = 20,
  options?: QueryOverrides<{ conversations: Conversation[]; hasMore: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.conversations(page, limit),
    queryFn: () => messagesApi.getConversations(page, limit),
    ...options,
  });
}

/**
 * @deprecated PAD-208 — this fetches the entire history in one request
 * (messaging.conversation-detail rule 1's deprecated unpaged branch). Use
 * `useConversationThread`, which asks for a page and can walk backwards. Kept
 * because it populates the same cache entry and is still the plainest way to
 * read a conversation that is known to be short.
 */
export function useConversation(
  conversationId: string | null | undefined,
  options?: QueryOverrides<Conversation>
) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId ?? "none"),
    queryFn: () => messagesApi.getConversation(conversationId as string),
    enabled: !!conversationId,
    ...options,
  });
}

export function useUnreadCount(
  options?: QueryOverrides<{ unreadCount: number }>
) {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => messagesApi.getUnreadMessagesCount(),
    ...options,
  });
}

// ── Coach levels ──

export function useCoachLevels(options?: QueryOverrides<CoachLevel[]>) {
  return useQuery({
    queryKey: queryKeys.coachLevels,
    queryFn: coachLevelApi.getCoachLevels,
    ...options,
  });
}

// ── Availability blockers ──

export function useAvailabilityBlockers(
  options?: QueryOverrides<AvailabilityBlocker[]>
) {
  return useQuery({
    queryKey: queryKeys.availabilityBlockers,
    queryFn: availabilityApi.listBlockers,
    ...options,
  });
}

// ── Training: exercises ──

export function useExercises(options?: QueryOverrides<Exercise[]>) {
  return useQuery({
    queryKey: queryKeys.exercises,
    queryFn: trainingApi.getExercises,
    ...options,
  });
}

export function useExercise(
  id: string | null | undefined,
  options?: QueryOverrides<Exercise>
) {
  return useQuery({
    queryKey: queryKeys.exercise(id ?? "none"),
    queryFn: () => trainingApi.getExercise(id as string),
    enabled: !!id,
    ...options,
  });
}

export function useCreateExercise(
  options?: UseMutationOptions<Exercise, unknown, ExercisePayload>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ExercisePayload) => trainingApi.createExercise(data),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateExercise(
  options?: UseMutationOptions<Exercise, unknown, { id: string; data: ExercisePayload }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExercisePayload }) =>
      trainingApi.updateExercise(id, data),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteExercise(
  options?: UseMutationOptions<void, unknown, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trainingApi.deleteExercise(id),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises });
      options?.onSuccess?.(...args);
    },
  });
}

// ── Training: exercise groups ──

export function useExerciseGroups(options?: QueryOverrides<ExerciseGroup[]>) {
  return useQuery({
    queryKey: queryKeys.exerciseGroups,
    queryFn: trainingApi.getExerciseGroups,
    ...options,
  });
}

export function useCreateExerciseGroup(
  options?: UseMutationOptions<ExerciseGroup, unknown, ExerciseGroupPayload>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ExerciseGroupPayload) =>
      trainingApi.createExerciseGroup(data),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exerciseGroups });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateExerciseGroup(
  options?: UseMutationOptions<ExerciseGroup, unknown, { id: string; data: ExerciseGroupPayload }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExerciseGroupPayload }) =>
      trainingApi.updateExerciseGroup(id, data),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exerciseGroups });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteExerciseGroup(
  options?: UseMutationOptions<void, unknown, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trainingApi.deleteExerciseGroup(id),
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exerciseGroups });
      options?.onSuccess?.(...args);
    },
  });
}
