import type { CalendarEvent, ClassType } from "@levelup/types";

/**
 * Serialization of a CalendarEvent into Expo Router query params (and back)
 * so the class detail screen (app/class/[id]) can rebuild the event needed by
 * POST /app/class_instance without refetching the whole week.
 */
export type ClassRouteParams = {
  id: string;
  model: string;
  originalId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  classType?: string;
  maxPlayers?: string;
  participantCount?: string;
  status?: string;
  color?: string;
  isRecurring?: string;
  /** Display-only fallbacks (used when opened from the dashboard, where only
   * pre-formatted labels are available). */
  displayDate?: string;
  displayTime?: string;
};

export function eventToParams(event: CalendarEvent): ClassRouteParams {
  return {
    id: event.id,
    model: event.model,
    originalId: String(event.originalId),
    date: event.date ?? "",
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    title: event.title ?? "",
    classType: event.classType ?? "",
    maxPlayers: event.maxPlayers != null ? String(event.maxPlayers) : "",
    participantCount:
      event.participantCount != null ? String(event.participantCount) : "",
    status: event.status ?? "",
    color: event.color ?? "",
    isRecurring: event.isRecurring ? "1" : "0",
  };
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function paramsToEvent(
  params: Partial<Record<keyof ClassRouteParams, string | string[]>>
): CalendarEvent | null {
  const id = first(params.id);
  const model = first(params.model);
  const originalId = first(params.originalId);
  if (!id || !model || !originalId) return null;

  const maxPlayers = Number(first(params.maxPlayers));
  const participantCount = Number(first(params.participantCount));

  return {
    id,
    model,
    originalId: Number(originalId),
    type: "class",
    isRecurring: first(params.isRecurring) === "1",
    title: first(params.title),
    date: first(params.date),
    startTime: first(params.startTime),
    endTime: first(params.endTime),
    color: first(params.color) || undefined,
    classType: (first(params.classType) || undefined) as ClassType | undefined,
    status: (first(params.status) || undefined) as CalendarEvent["status"],
    maxPlayers: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : undefined,
    participantCount:
      Number.isFinite(participantCount) && first(params.participantCount) !== ""
        ? participantCount
        : undefined,
  };
}

/**
 * Dashboard class-list items only carry the calendar event id, which encodes
 * model + original id (+ occurrence date for recurring lessons):
 *   "lessoninstance-12" | "lesson-3" | "lesson-3-2026-07-07"
 */
export function parseDashboardItemId(
  itemId: string
): { model: string; originalId: number; date: string } | null {
  const match = /^(lessoninstance|lesson)-(\d+)(?:-(\d{4}-\d{2}-\d{2}))?$/.exec(
    itemId
  );
  if (!match) return null;
  return {
    model: match[1] === "lessoninstance" ? "LessonInstance" : "Lesson",
    originalId: Number(match[2]),
    date: match[3] ?? "",
  };
}
