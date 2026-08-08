import { getApi } from "@levelup/api";

/**
 * Seasons and data-import endpoints.
 *
 * These live here rather than in `packages/api` on purpose: neither resource
 * exists in the shared package yet (checked — `packages/api/src/resources/`
 * has no seasons.ts and no import.ts; web calls them from
 * `apps/web/src/api/{seasons,import}.ts`), and this stream may not edit
 * `packages/api/src/index.ts` while another stream is lifting shared code
 * into that package. `getApi()` is the same axios singleton every other
 * resource module uses, so auth headers and the rolling-refresh interceptor
 * apply identically.
 *
 * Web's `USE_MOCK_DATA` short-circuits are deliberately not ported — that
 * config is web-only and mobile has no mock mode.
 *
 * Shapes below were measured against the E2E backend on :5001, not inferred:
 *   GET /api/app/seasons        → [{"id":1,"name":"Autumn 2026",
 *                                   "startDate":"2026-08-08","endDate":"2026-11-08"}]
 *   GET /api/app/import/history → [{"id":10,"created_at":"2026-08-08T02:50:37.248342",
 *                                   "filename":null,"status":"reverted",
 *                                   "summary":{"Players":1}}]
 * Note `id` comes back as a NUMBER even though `@levelup/types`' `Season`
 * declares `id: string` (web has the same mismatch and round-trips the raw
 * value). Typed honestly here as `string | number` and round-tripped
 * unchanged, so the upsert addresses the same row web would.
 */

export interface MobileSeason {
  id: string | number;
  name: string;
  startDate: string;
  endDate: string;
}

/** Omit `id` to create; include it to update that season in place (PAD-89). */
export interface SeasonUpsert {
  id?: string | number;
  name: string;
  startDate: string;
  endDate: string;
}

export async function getSeasons(): Promise<MobileSeason[]> {
  const res = await getApi().get<MobileSeason[]>("/app/seasons");
  return res.data;
}

export async function addSeasons(data: SeasonUpsert[]): Promise<MobileSeason[]> {
  const res = await getApi().post<MobileSeason[]>("/app/add_seasons", data);
  return res.data;
}

export async function deleteSeason(id: string | number): Promise<void> {
  await getApi().post("/app/delete/season", { id });
}

export interface ImportHistoryEntry {
  id: number;
  created_at: string;
  filename: string | null;
  status: string;
  summary: Record<string, number>;
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  const res = await getApi().get<ImportHistoryEntry[]>("/app/import/history");
  return res.data;
}

export async function revertImport(importId: number): Promise<void> {
  await getApi().post(`/app/import/${importId}/revert`);
}
