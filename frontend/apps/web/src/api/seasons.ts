import "@/api/client";
import type { Season } from "@/types";
import * as seasonsApi from "@levelup/api/src/resources/seasons";
import type { SeasonUpsert } from "@levelup/api/src/resources/seasons";
import { USE_MOCK_DATA } from "@/config";

export type { SeasonUpsert };

export async function getSeasons(): Promise<Season[]> {
  if (USE_MOCK_DATA) {
    // The demo dataset in `@/data` has no seasons to fake; Settings → Calendar
    // renders its empty state under mock mode, as it always has.
    return [];
  }

  return seasonsApi.getSeasons();
}

export async function addSeasons(data: SeasonUpsert[]): Promise<Season[]> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addSeasons", data);
    return data.map((s) => ({
      ...s,
      id: String(s.id ?? crypto.randomUUID()),
    }));
  }

  return seasonsApi.addSeasons(data);
}

export async function deleteSeason(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteSeason", id);
    return;
  }

  return seasonsApi.deleteSeason(id);
}
