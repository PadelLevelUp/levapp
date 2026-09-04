import type { Season } from "@levelup/types";
import { getApi } from "../client";

/**
 * Seasons — the coach-defined named date ranges edited in Settings → Calendar
 * (spec `calendar.seasons`). Both shells consume this module; neither talks to
 * axios directly (R-012).
 *
 * Response shapes below were measured against the E2E backend on :5001, not
 * inferred:
 *   GET  /api/app/seasons      → [{"id":1,"name":"Autumn 2026",
 *                                  "startDate":"2026-08-08","endDate":"2026-11-08"}]
 *   POST /api/app/add_seasons  → the coach's seasons after the upsert, same shape
 *
 * Note `id` comes back as a NUMBER even though `@levelup/types`' `Season`
 * declares `id: string`. Both apps round-trip the raw value unchanged rather
 * than coercing it, so the id sent back on an upsert addresses the same row.
 * The write helpers therefore take `string | number`; the read helpers keep the
 * declared `Season` shape so existing callers type-check unchanged.
 *
 * `USE_MOCK_DATA` short-circuits are deliberately NOT here — that config is
 * web-only, so the web wrapper (`apps/web/src/api/seasons.ts`) keeps them.
 */

/**
 * A season to upsert. `id` addresses an already-persisted season so the backend
 * updates it in place; omit it to create a new one (PAD-89, spec rule 3).
 */
export interface SeasonUpsert {
  id?: string | number;
  name: string;
  startDate: string;
  endDate: string;
}

export async function getSeasons(): Promise<Season[]> {
  const res = await getApi().get<Season[]>("/app/seasons");
  return res.data;
}

/**
 * Pure upsert: a persisted season the payload does not mention is left
 * untouched (spec rule 4). Removal goes through `deleteSeason`.
 *
 * The whole batch is rejected with 400 if any entry overlaps another, or a
 * persisted season the payload does not address (spec rules 1, 5, 6).
 */
export async function addSeasons(data: SeasonUpsert[]): Promise<Season[]> {
  const res = await getApi().post<Season[]>("/app/add_seasons", data);
  return res.data;
}

export async function deleteSeason(id: string | number): Promise<void> {
  await getApi().post("/app/delete/season", { id });
}
