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

export async function addSeasons(
  data: { name: string; startDate: string; endDate: string }[]
): Promise<Season[]> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addSeasons", data);
    return data.map((s) => ({ id: crypto.randomUUID(), ...s }));
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
