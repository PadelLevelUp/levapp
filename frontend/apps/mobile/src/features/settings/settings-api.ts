import { getApi } from "@levelup/api";

/**
 * Data-import endpoints for the Settings screen.
 *
 * Seasons used to live here too, as a hand-rolled copy of web's
 * `apps/web/src/api/seasons.ts` — both of them calling axios directly. PAD-176
 * (compass bug B-011) lifted them into `@levelup/api`'s
 * `resources/seasons.ts`, which both shells now share; `seasons-section.tsx`
 * imports `seasonsApi` from there. Import history has no shared resource yet
 * (web calls it from `apps/web/src/api/import.ts`), so it stays here for now.
 *
 * `getApi()` is the same axios singleton every resource module uses, so auth
 * headers and the rolling-refresh interceptor apply identically.
 *
 * Shape below was measured against the E2E backend on :5001, not inferred:
 *   GET /api/app/import/history → [{"id":10,"created_at":"2026-08-08T02:50:37.248342",
 *                                   "filename":null,"status":"reverted",
 *                                   "summary":{"Players":1}}]
 */

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
