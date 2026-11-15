import type { CoachPresencesView } from "@levelup/types";
import { getApi } from "../client";

/** settings.coach-presences-view (PAD-837b), coach only. */
export interface CoachPresencesViewResponse {
  presencesView: CoachPresencesView;
}

export async function getCoachPresencesView(): Promise<CoachPresencesViewResponse> {
  const res = await getApi().get("/app/coach/presences-view");
  return res.data;
}

/** Replaces the whole value; `null` clears it back to "not set". A bad shape answers
 *  400 `{code: "INVALID_PRESENCES_VIEW"}` and stores nothing. */
export async function putCoachPresencesView(presencesView: CoachPresencesView): Promise<CoachPresencesViewResponse> {
  const res = await getApi().put("/app/coach/presences-view", { presencesView });
  return res.data;
}
