import "@/api/client";
import type { AttendanceHistory } from "@/types";
import * as attendanceApi from "@levelup/api/src/resources/attendance";
import type { AttendanceHistoryParams } from "@levelup/api/src/resources/attendance";
import { USE_MOCK_DATA } from "@/config";
import { buildMockAttendanceHistory } from "@/data/mockAttendance";

export type { AttendanceHistoryParams };

/**
 * PAD-114 — attended-class history for the caller, or for a roster player.
 *
 * The `playerId` a caller passes is never trusted client-side: the endpoint
 * re-authorizes the subject (self, or a coach's own roster) and 403s otherwise.
 */
export async function getAttendanceHistory(
  params: AttendanceHistoryParams = {}
): Promise<AttendanceHistory> {
  if (USE_MOCK_DATA) {
    return buildMockAttendanceHistory(params);
  }

  return attendanceApi.getAttendanceHistory(params);
}
