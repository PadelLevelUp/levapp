import type { SeasonDefinition, SeasonDefinitionInput } from "@levelup/types";
import { getApi } from "../client";

/**
 * The coach's single recurring day/month season (spec `calendar.seasons`,
 * PAD-82). Both shells consume this module; neither talks to axios directly
 * (R-012).
 *
 *   GET    /api/app/season → the definition (rule 5), or `null` when none
 *   PUT    /api/app/season → create/replace; 400 `invalid_season` on a bad range
 *   DELETE /api/app/season → 204
 *
 * `USE_MOCK_DATA` short-circuits are deliberately NOT here — that config is
 * web-only, so the web wrapper (`apps/web/src/api/seasons.ts`) keeps them.
 */

export async function getSeason(): Promise<SeasonDefinition | null> {
  const res = await getApi().get<SeasonDefinition | null>("/app/season");
  return res.data ?? null;
}

export async function saveSeason(data: SeasonDefinitionInput): Promise<SeasonDefinition> {
  const res = await getApi().put<SeasonDefinition>("/app/season", data);
  return res.data;
}

export async function deleteSeason(): Promise<void> {
  await getApi().delete("/app/season");
}
