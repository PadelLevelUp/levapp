import "@/api/client";
import type { AbsenceHistory } from "@levelup/types";
import * as attendanceApi from "@levelup/api/src/resources/attendance";
import type { AttendanceHistoryParams } from "@levelup/api/src/resources/attendance";
import { USE_MOCK_DATA } from "@/config";
import { buildMockAbsenceHistory } from "@/data/mockAttendance";

export type { AttendanceHistoryParams };

/**
 * PAD-141 — missed-class history for the caller, or for a roster player.
 *
 * As with attendance, the `playerId` a caller passes is never trusted
 * client-side: the endpoint re-authorizes the subject with the same resolver
 * and 403s otherwise.
 */
export async function getAbsenceHistory(
  params: AttendanceHistoryParams = {}
): Promise<AbsenceHistory> {
  if (USE_MOCK_DATA) {
    return buildMockAbsenceHistory(params);
  }

  return attendanceApi.getAbsenceHistory(params);
}
