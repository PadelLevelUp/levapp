import type { CalendarEvent, CoachRequestsQuery } from "@levelup/types";
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
  // PAD-840 (classes.delete rule 14): a class's kept cancellations; without an id, the prefix a removal invalidates.
  classCancellations: (lessonId?: string) =>
    (lessonId === undefined ? ["class-cancellations"] : ["class-cancellations", lessonId]) as readonly unknown[],
  // The class screen's by-id read (calendar.event-detail rule 15): under the class-instance family so every
  // broad invalidation of it (the live events in requestEvents.ts, the calendar mutations) refreshes it too.
  lessonInstanceById: (instanceId: number | null | undefined) =>
    ["class-instance", "by-id", instanceId ?? "none"] as const,
  // The coach's whole roster (`GET /app/coach_players`): mobile's coachPlayersKey, and the
  // source of PAD-660's display names (useCoachDisplayName).
  coachPlayers: ["coach-players"] as const,
  // Who the viewer may start a conversation with (messaging.conversations rule 7).
  messageableUsers: ["messageable-users"] as const,
  coachPlayersPaginated: (params: PlayersQueryParams = {}) =>
    ["coach-players-paginated", params] as const,
  // client.query-cache: the prefix every roster write invalidates (all pages and filters).
  coachPlayersPaginatedPrefix: ["coach-players-paginated"] as const,
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
  // PAD-423: the coach's evaluation scale (one per coach).
  evaluationScale: ["evaluation-scale"] as const,
  // PAD-648: the "Não lidas" list is its own entry under the same prefix; the full list's key is unchanged.
  conversations: (page = 1, limit = 20, unread = false) =>
    unread
      ? (["conversations", { page, limit, unread: true }] as const)
      : (["conversations", { page, limit }] as const),
  conversation: (conversationId: string) =>
    ["conversation", conversationId] as const,
  unreadCount: ["messages-unread-count"] as const,
  coachLevels: ["coach_levels"] as const,
  availabilityBlockers: ["availability-blockers"] as const,
  // PAD-104: class requests (both roles), the student's coaches, a coach's free blocks.
  classRequests: ["class-requests"] as const,
  classRequestCoaches: ["class-request-coaches"] as const,
  // classes.join-requests rule 17 (PAD-460): the caller's academy join requests, shown
  // beside `classRequests` in the same lists.
  classJoinRequests: ["class-join-requests"] as const,
  // classes.coach-requests-table rule 14 (PAD-795): one page of the coach's table; the bare prefix
  // is what every request event invalidates, so each page, sort and filter reads again.
  coachRequests: (params?: CoachRequestsQuery) =>
    (params === undefined ? ["coach-requests"] : ["coach-requests", params]) as readonly unknown[],
  /** PAD-504: the student's waiting-list places (classes.academy-class-booking rule 11). */
  classWaitingList: ["class-waiting-list"] as const,
  classRequestFreeBlocks: (coachId: string, date: string, excludeRequestId?: number) =>
    ["class-request-free-blocks", coachId, date, excludeRequestId ?? null] as const,
  exercises: ["exercises"] as const,
  exercise: (id: string) => ["exercises", id] as const,
  exerciseGroups: ["exercise-groups"] as const,
  // ── PAD-402 evaluation sharing ──
  myEvaluations: ["my-evaluations"] as const,
  // PAD-443: the Presences badge. Under the `presence-pending` prefix, so every presence write that
  // already invalidates the pending list (iOS `useInvalidatePresences`) refreshes the badge too.
  pendingValidationBadge: ["presence-pending", "badge"] as const,
  // client.query-cache rule 7 (PAD-586): the shared roster and the presences reads. The key strings
  // are the mobile ones (`features/presences/presence-invalidation.ts`, `hooks.ts`) so both apps invalidate alike.
  coachRoster: ["coach-players"] as const,
  // attendance.validation rule 17g (PAD-837): stats and trend are keyed by the same period, so the
  // two reads can never be for different windows. "" is the server's default window. Every presence
  // write invalidates by the prefixes, as before.
  presenceStatsPrefix: ["presence-stats"] as const,
  presenceStats: (from = "", to = "") => ["presence-stats", from, to] as const,
  // settings.coach-presences-view (PAD-837b): the coach's saved Presences columns.
  coachPresencesView: ["coach-presences-view"] as const,
  presenceTrendPrefix: ["presence-trend"] as const,
  presenceTrend: (playerIdsKey: string, from = "", to = "") =>
    ["presence-trend", playerIdsKey, from, to] as const,
  presencePendingPrefix: ["presence-pending"] as const,
  presencePending: (from: string, to: string) => ["presence-pending", from, to] as const,
  presencePendingCount: (from: string, to: string) =>
    ["presence-pending", "count", from, to] as const,
};
