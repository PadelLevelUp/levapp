import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { useLessonInstanceById } from "@levelup/hooks";
import {
  eventFromLessonInstance,
  instanceIdFromParams,
  paramsToEvent,
  type ClassRouteParams,
  type LessonInstancePayload,
} from "./params";

/**
 * The read's date, times, capacity and status, as one set: a class that moved since the card was drawn must
 * not show the old start with the new end. The route keeps only what the read does not decide (title, colour).
 */
function completeEvent(route: CalendarEvent, instance: LessonInstancePayload): CalendarEvent {
  const read = eventFromLessonInstance(instance);
  return {
    ...route,
    date: read.date || route.date,
    startTime: read.startTime || route.startTime,
    endTime: read.endTime || route.endTime,
    maxPlayers: read.maxPlayers ?? route.maxPlayers,
    status: read.status || route.status,
    title: route.title || read.title,
    color: route.color || read.color,
  };
}

/**
 * calendar.event-detail rule 15, CALENDAR-EVENT-DETAIL-47: the event the class screen renders, from its route.
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
  // One read per open, and per-query overrides need a reason (client.query-cache rule 3): it is made on every
  // mount (a reopen must not show the times of an earlier visit; saves and live events refresh it through
  // `invalidateClassInstance` and the `["class-instance"]` family), and never again on a focus or reconnect.
  const byId = useLessonInstanceById(fallbackId ?? completeId, {
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const instance = byId.data?.lessonInstance;
  const event = React.useMemo<CalendarEvent | null>(() => {
    if (paramsEvent) return completeId && instance ? completeEvent(paramsEvent, instance) : paramsEvent;
    return instance ? eventFromLessonInstance(instance) : null;
  }, [paramsEvent, completeId, instance]);
  // class_instance waits for a read that is RUNNING: `getClassInstance` copies the event's times into its result,
  // so asking early would cache empty times under the same key. `isLoading` is false for a read that cannot run
  // (offline: paused), so a cached class still shows instead of waiting forever.
  const classEvent = completeId && byId.isLoading ? null : event;
  return { event, fallbackId, byId, classEvent };
}

/** Refresh what the class screen shows after it changed the class (a save, a cancel, a scope change). */
export function invalidateClassInstance(queryClient: QueryClient, event: CalendarEvent) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.classInstance(event) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.lessonInstanceById(Number(event.originalId)) }),
  ]);
}
