import "@/api/client";
import type { AttendanceHistory } from "@/types";
import * as attendanceApi from "@levelup/api/src/resources/attendance";
import type { AttendanceHistoryParams } from "@levelup/api/src/resources/attendance";

export type { AttendanceHistoryParams };

/** PAD-114 — attended-class history for the caller, or for a roster player. */
export async function getAttendanceHistory(
  params: AttendanceHistoryParams = {}
): Promise<AttendanceHistory> {
  return attendanceApi.getAttendanceHistory(params);
}
