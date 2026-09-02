import type { Season } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";

export async function getSeasons(): Promise<Season[]> {
  if (USE_MOCK_DATA) {
    return [];
  }

  const res = await api.get("/app/seasons");
  return res.data;
}

/**
 * A season to upsert. `id` addresses an already-persisted season so the backend
 * updates it in place; omit it to create a new one (PAD-89).
 */
export interface SeasonUpsert {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
}

export async function addSeasons(data: SeasonUpsert[]): Promise<Season[]> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addSeasons", data);
    return data.map((s) => ({ ...s, id: s.id ?? crypto.randomUUID() }));
  }

  const res = await api.post("/app/add_seasons", data);
  return res.data;
}

export async function deleteSeason(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteSeason", id);
    return;
  }
  await api.post("/app/delete/season", { id });
}
