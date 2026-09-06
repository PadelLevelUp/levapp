import { useQuery } from "@tanstack/react-query";
import * as attendanceApi from "@levelup/api/src/resources/attendance";

import type { AttendanceRange } from "./date-ranges";

/**
 * PAD-162 — query wiring for the mobile attendance-history screen.
 *
 * The request layer is already shared (`@levelup/api/resources/attendance`,
 * PAD-114), so this module only binds it to React Query. Web drives the same
 * function through its own `useState`/`useEffect` loop; both call one function,
 * so the platforms cannot drift on request shape.
 *
 * `playerId` is part of the key and nothing else: it is NOT authorization.
 * `GET /app/attendance_history` re-checks the caller server-side — self, or a
 * coach with an `Association_CoachPlayer` row — and 403s otherwise (spec
 * `attendance.history` rule 3). A route param is never treated as a grant.
 */

export const attendanceKeys = {
  history: (playerId: string | undefined, range: AttendanceRange) =>
    ["attendance-history", playerId ?? "self", range.from, range.to] as const,
};

export function useAttendanceHistory(
  range: AttendanceRange,
  playerId?: string
) {
  return useQuery({
    queryKey: attendanceKeys.history(playerId, range),
    queryFn: () =>
      attendanceApi.getAttendanceHistory({
        playerId: playerId || undefined,
        from: range.from,
        to: range.to,
      }),
    // A range change is a new key, and React Query would otherwise blank the
    // screen back to the skeleton on every tap of 1W/1M/1Y. Keeping the last
    // page visible while the next one loads is what the web shell does by
    // holding its previous `history` state through the fetch.
    placeholderData: (previous) => previous,
  });
}

/**
 * PAD-163 — query wiring for the mobile "Faltas" (absences) screen.
 *
 * Same shape as `useAttendanceHistory` above, against the sibling
 * `getAbsenceHistory` endpoint (PAD-141): same params, same authorization
 * caveat (a `playerId` is never trusted client-side — the server re-resolves
 * the caller and 403s otherwise), and a disjoint query key so the two
 * histories never share a cache entry.
 */
export const absenceKeys = {
  history: (playerId: string | undefined, range: AttendanceRange) =>
    ["absence-history", playerId ?? "self", range.from, range.to] as const,
};

export function useAbsenceHistory(range: AttendanceRange, playerId?: string) {
  return useQuery({
    queryKey: absenceKeys.history(playerId, range),
    queryFn: () =>
      attendanceApi.getAbsenceHistory({
        playerId: playerId || undefined,
        from: range.from,
        to: range.to,
      }),
    placeholderData: (previous) => previous,
  });
}
