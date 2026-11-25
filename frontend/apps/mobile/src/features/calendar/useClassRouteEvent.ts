import * as React from "react";
import type { CalendarEvent } from "@levelup/types";
import { useLessonInstanceById } from "@levelup/hooks";
import {
  eventFromLessonInstance,
  instanceIdFromParams,
  paramsToEvent,
  type ClassRouteParams,
  type LessonInstancePayload,
} from "./params";

/** The read's values fill what the route has none of; the route's own values win. */
function completeEvent(route: CalendarEvent, instance: LessonInstancePayload): CalendarEvent {
  const read = eventFromLessonInstance(instance);
  return {
    ...route,
    date: route.date || read.date,
    startTime: route.startTime || read.startTime,
    endTime: route.endTime || read.endTime,
    title: route.title || read.title,
    color: route.color || read.color,
    status: route.status || read.status,
    maxPlayers: route.maxPlayers ?? read.maxPlayers,
  };
}

/**
 * calendar.event-detail rule 15, CALENDAR-EVENT-DETAIL-40: the event the class screen renders, from its route.
 * - Full params are the fast path: no read.
 * - A route with only an id is resolved by `GET /lesson_instance/<id>` (`fallbackId`; the gone/retry states).
 * - A `LessonInstance` route that has an id but lacks date, times or capacity (a dashboard card, a message
 *   link, the attendance history) is completed from the same read, once per open: the route wins, the read
 *   fills the gaps, and `classEvent` (what `class_instance` is asked with) waits for the read so it never
 *   goes out with an empty date. A failed read leaves the route's own event, with no gone state.
 */
export function useClassRouteEvent(params: Partial<Record<keyof ClassRouteParams, string | string[]>>) {
  const paramsEvent = React.useMemo(() => paramsToEvent(params), [
    params.id,
    params.model,
    params.originalId,
    params.date,
  ]);
  const fallbackId = paramsEvent ? null : instanceIdFromParams(params);
  const completeId =
    paramsEvent &&
    paramsEvent.model === "LessonInstance" &&
    paramsEvent.originalId > 0 &&
    (!paramsEvent.date || !paramsEvent.startTime || !paramsEvent.endTime || paramsEvent.maxPlayers === undefined)
      ? paramsEvent.originalId
      : null;
  // One read per open: no refetch on focus, reconnect or re-render while it is fresh.
  const byId = useLessonInstanceById(fallbackId ?? completeId, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const instance = byId.data?.lessonInstance;
  const event = React.useMemo<CalendarEvent | null>(() => {
    if (paramsEvent) return completeId && instance ? completeEvent(paramsEvent, instance) : paramsEvent;
    return instance ? eventFromLessonInstance(instance) : null;
  }, [paramsEvent, completeId, instance]);
  const classEvent = completeId && byId.isPending ? null : event;
  return { event, fallbackId, byId, classEvent };
}
