import type { AttendanceGranularity, AttendanceHistory } from "@levelup/types";
import { getApi } from "../client";

export interface AttendanceHistoryParams {
  /** Omit for the signed-in student; pass a roster player id as a coach. */
  playerId?: number | string;
  /** ISO date or datetime. `from` and `to` are only honoured together. */
  from?: string;
  to?: string;
  /** Optional pin; by default the server derives it from the span. */
  granularity?: AttendanceGranularity;
}

/**
 * PAD-114 — attended-class history for one player.
 *
 * The endpoint re-authorizes server-side (spec `attendance.history` rule 3): a
 * student may only read their own history, a coach only a player on their own
 * roster. Anything else is a 403, so callers must not treat a `playerId` from
 * the URL as pre-authorized.
 */
export async function getAttendanceHistory(
  params: AttendanceHistoryParams = {}
): Promise<AttendanceHistory> {
  const res = await getApi().get("/app/attendance_history", {
    params: {
      playerId: params.playerId,
      from: params.from,
      to: params.to,
      granularity: params.granularity,
    },
  });
  return res.data;
}
