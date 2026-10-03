import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

/** The realtime events that mean a class or join request changed. */
export const REQUEST_EVENT_TYPES = [
  "class_request_changed",
  "join_request_created",
  "join_requests_superseded",
  "join_request_decided",
] as const;

export function isRequestEvent(type: string): boolean {
  return (REQUEST_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * classes.class-requests rule 19 (PAD-488, B-264): a request change can move a hold, drop it or
 * put a class in its place, so the calendar refreshes with the request lists — every calendar
 * range (`["calendar-events", …]`), every class sheet (`["class-instance", …]`) and the dashboard
 * (`["dashboard", …]`: "next class" and the 7-day schedule). Called by the
 * realtime handler of both shells and by every request action, so an open calendar follows the
 * request on the device that acted, the other person's devices and the actor's other devices.
 */
export async function refreshAfterRequestChange(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.classRequests }),
    queryClient.invalidateQueries({ queryKey: queryKeys.classJoinRequests }),
    // PAD-504: a student's waiting-list places sit in the same request history.
    queryClient.invalidateQueries({ queryKey: queryKeys.classWaitingList }),
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
    queryClient.invalidateQueries({ queryKey: ["class-instance"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
}
