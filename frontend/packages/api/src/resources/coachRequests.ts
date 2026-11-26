import type { CoachRequestsPage, CoachRequestsQuery } from "@levelup/types";
import { getApi } from "../client";

export type { CoachRequestsQuery };

/** The query string the endpoint reads; unset and empty values are left out. */
export function coachRequestsParams(q: CoachRequestsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") out[key] = value;
  };
  put("section", q.section);
  put("page", q.page);
  put("per_page", q.perPage);
  put("sort_by", q.sortBy);
  put("sort_dir", q.sortDir);
  put("kind", q.kind);
  put("status", q.status?.length ? q.status.join(",") : undefined);
  put("side", q.side);
  put("class_from", q.classFrom);
  put("class_to", q.classTo);
  put("class_time_from", q.classTimeFrom);
  put("class_time_to", q.classTimeTo);
  put("requested_from", q.requestedFrom);
  put("requested_to", q.requestedTo);
  put("player_id", q.playerId);
  put("id", q.id);
  return out;
}

/** The coach's private and academy requests, one page (`GET /app/coach-requests`; coach only). */
export async function listCoachRequests(q: CoachRequestsQuery = {}): Promise<CoachRequestsPage> {
  const res = await getApi().get("/app/coach-requests", { params: coachRequestsParams(q) });
  return res.data;
}
