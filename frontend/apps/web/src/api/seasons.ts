import "@/api/client";
import type { SeasonDefinition, SeasonDefinitionInput } from "@/types";
import * as seasonsApi from "@levelup/api/src/resources/seasons";
import { nextSeasonOccurrence, seasonOccurrenceContaining, seasonOccurrenceLabel, seasonWrapsYear } from "@levelup/config";
import { USE_MOCK_DATA } from "@/config";

/**
 * calendar.seasons (PAD-82): the coach's single recurring day/month season.
 * Thin wrapper over the shared resource with the web-only mock switch.
 */

let mockDefinition: SeasonDefinition | null = null;

function mockFrom(input: SeasonDefinitionInput): SeasonDefinition {
  const today = new Date().toISOString().slice(0, 10);
  const current = seasonOccurrenceContaining(today, input);
  const upcoming = nextSeasonOccurrence(today, input);
  const label = input.label?.trim() || null;
  return {
    label,
    startDay: input.startDay,
    startMonth: input.startMonth,
    endDay: input.endDay,
    endMonth: input.endMonth,
    wrapsYear: seasonWrapsYear(input),
    needsReview: false,
    current: current ? { ...current, label: seasonOccurrenceLabel(current, label) } : null,
    upcoming: upcoming ? { ...upcoming, label: seasonOccurrenceLabel(upcoming, label) } : null,
  };
}

export async function getSeason(): Promise<SeasonDefinition | null> {
  if (USE_MOCK_DATA) return mockDefinition;
  return seasonsApi.getSeason();
}

export async function saveSeason(data: SeasonDefinitionInput): Promise<SeasonDefinition> {
  if (USE_MOCK_DATA) {
    console.log("[mock] saveSeason", data);
    mockDefinition = mockFrom(data);
    return mockDefinition;
  }
  return seasonsApi.saveSeason(data);
}

export async function deleteSeason(): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteSeason");
    mockDefinition = null;
    return;
  }
  return seasonsApi.deleteSeason();
}
