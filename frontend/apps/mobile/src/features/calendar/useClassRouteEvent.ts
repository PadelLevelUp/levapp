import * as React from "react";
import type { CalendarEvent } from "@levelup/types";
import { useLessonInstanceById } from "@levelup/hooks";
import { eventFromLessonInstance, instanceIdFromParams, paramsToEvent, type ClassRouteParams } from "./params";

/**
 * calendar.event-detail rule 15: the event the class screen renders, from its route.
 * Full params are the fast path; a route with only an id is resolved by `GET /lesson_instance/<id>`.
 */
export function useClassRouteEvent(params: Partial<Record<keyof ClassRouteParams, string | string[]>>) {
  const paramsEvent = React.useMemo(() => paramsToEvent(params), [
    params.id,
    params.model,
    params.originalId,
    params.date,
  ]);
  const fallbackId = paramsEvent ? null : instanceIdFromParams(params);
  const byId = useLessonInstanceById(fallbackId);
  const event = React.useMemo<CalendarEvent | null>(
    () =>
      paramsEvent ??
      (byId.data?.lessonInstance ? eventFromLessonInstance(byId.data.lessonInstance) : null),
    [paramsEvent, byId.data]
  );
  return { event, fallbackId, byId, classEvent: event };
}
