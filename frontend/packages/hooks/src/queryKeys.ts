import type { CalendarEvent } from "@levelup/types";
import type { PlayersQueryParams } from "@levelup/api/src/resources/players";

/**
 * Central query-key registry. Keys used by the web app are kept identical to
 * the inline keys it already uses ("exercises", "exercise-groups",
 * "coach_levels") so cache invalidation stays consistent across platforms.
 */
export const queryKeys = {
  dashboard: (params?: { from?: string; to?: string }) =>
    ["dashboard", params ?? {}] as const,
  calendarEvents: (from: string, to: string) =>
    ["calendar-events", { from, to }] as const,
  classInstance: (event: Pick<CalendarEvent, "model" | "originalId" | "date">) =>
    ["class-instance", event.model, event.originalId, event.date] as const,
  coachPlayersPaginated: (params: PlayersQueryParams = {}) =>
    ["coach-players-paginated", params] as const,
  playerProfile: (playerId: string) => ["player-profile", playerId] as const,
  conversations: (page = 1, limit = 20) =>
    ["conversations", { page, limit }] as const,
  conversation: (conversationId: string) =>
    ["conversation", conversationId] as const,
  unreadCount: ["messages-unread-count"] as const,
  coachLevels: ["coach_levels"] as const,
  availabilityBlockers: ["availability-blockers"] as const,
  exercises: ["exercises"] as const,
  exercise: (id: string) => ["exercises", id] as const,
  exerciseGroups: ["exercise-groups"] as const,
};
