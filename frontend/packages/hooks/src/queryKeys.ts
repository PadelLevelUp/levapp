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
  // PAD-374: the v2 evaluation API. One key per coach-player history; the competency set is the coach's.
  playerEvaluations: (playerId: string) => ["player-evaluations", playerId] as const,
  evaluationCompetencies: ["evaluation-competencies"] as const,
  // PAD-375: one evolution per (player, competency); the two-part prefix invalidates a player's.
  playerEvolution: (playerId: string, categoryId?: number) =>
    (categoryId === undefined ? ["player-evolution", playerId] : ["player-evolution", playerId, categoryId]) as readonly unknown[],
  // PAD-376: the class panel's read, per dated occurrence; without a ref, the prefix every evaluation write invalidates.
  classEvaluations: (ref?: { model: string; id: number; date?: string | null }) =>
    (ref === undefined ? ["class-evaluations"] : ["class-evaluations", ref.model, ref.id, ref.date ?? null]) as readonly unknown[],
  // PAD-373: what deleting one competency would remove (scores, players) — read before the typed-name step.
  evaluationCompetencyImpact: (competencyId: number) => ["evaluation-competency-impact", competencyId] as const,
  // PAD-404: the coach's evaluation reminder setting (one per coach).
  evaluationSettings: ["evaluation-settings"] as const,
  conversations: (page = 1, limit = 20) =>
    ["conversations", { page, limit }] as const,
  conversation: (conversationId: string) =>
    ["conversation", conversationId] as const,
  unreadCount: ["messages-unread-count"] as const,
  coachLevels: ["coach_levels"] as const,
  availabilityBlockers: ["availability-blockers"] as const,
  // PAD-104: class requests (both roles), the student's coaches, a coach's free blocks.
  classRequests: ["class-requests"] as const,
  classRequestCoaches: ["class-request-coaches"] as const,
  classRequestFreeBlocks: (coachId: string, date: string, excludeRequestId?: number) =>
    ["class-request-free-blocks", coachId, date, excludeRequestId ?? null] as const,
  exercises: ["exercises"] as const,
  exercise: (id: string) => ["exercises", id] as const,
  exerciseGroups: ["exercise-groups"] as const,
};
