import type { CoachWorkingHours } from "@levelup/types";
import { getApi } from "../client";

/** settings.coach-working-hours (PAD-357), coach only. */
export interface CoachWorkingHoursResponse {
  workingHours: CoachWorkingHours;
  defaultWindow: { startTime: string; endTime: string };
}

export async function getCoachWorkingHours(): Promise<CoachWorkingHoursResponse> {
  const res = await getApi().get("/app/coach/working-hours");
  return res.data;
}

/** Replaces the whole value; `null` clears it back to "not set". A bad day
 *  answers 400 `{code: "INVALID_WORKING_HOURS", day}`. */
export async function putCoachWorkingHours(workingHours: CoachWorkingHours): Promise<CoachWorkingHoursResponse> {
  const res = await getApi().put("/app/coach/working-hours", { workingHours });
  return res.data;
}
