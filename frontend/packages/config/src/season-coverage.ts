/**
 * calendar.seasons rules 3–4 (PAD-82): the occurrence maths for the coach's
 * single recurring day/month season.
 *
 * A definition is `{startDay, startMonth, endDay, endMonth}` and *wraps* the
 * year when the end marker comes before the start marker (1 Sep → 31 Jul, the
 * production case). An *occurrence* is one concrete inclusive
 * `{startDate, endDate}`; a date the season does not cover is a *gap* (August
 * for 1 Sep → 31 Jul) and answers `null`.
 *
 * Used by iOS to warn BEFORE submitting a "recurs until season end" class
 * (rule 13) and by both shells for the Settings preview and the "Season"
 * attendance preset (rules 12, 14). It is a hint, never a gate: the server's
 * copy (`padel_app/tools/season_dates.py`) stays the authority, and the same
 * cases pin both.
 *
 * Everything speaks bare "YYYY-MM-DD" and UTC, matching the attendance range
 * maths; a local-time `Date` would shift a day at the edges.
 */

export interface SeasonDefinitionLike {
  startDay: number;
  startMonth: number;
  endDay: number;
  endMonth: number;
}

export interface SeasonOccurrenceRange {
  /** Inclusive first day, "YYYY-MM-DD". */
  startDate: string;
  /** Inclusive last day, "YYYY-MM-DD". */
  endDate: string;
}

const dayKey = (date: string | null | undefined): string => (date ?? "").slice(0, 10);

const pad = (n: number): string => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one (UTC, no DST edge).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "YYYY-MM-DD" with the day clamped to the month's length (29 Feb → 28 Feb in a non-leap year). */
export function clampDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}

export function seasonWrapsYear(definition: SeasonDefinitionLike): boolean {
  return (
    definition.endMonth < definition.startMonth ||
    (definition.endMonth === definition.startMonth && definition.endDay < definition.startDay)
  );
}

function occurrenceStarting(year: number, definition: SeasonDefinitionLike): SeasonOccurrenceRange {
  const endYear = seasonWrapsYear(definition) ? year + 1 : year;
  return {
    startDate: clampDay(year, definition.startMonth, definition.startDay),
    endDate: clampDay(endYear, definition.endMonth, definition.endDay),
  };
}

function validDefinition(definition: SeasonDefinitionLike | null | undefined): definition is SeasonDefinitionLike {
  return (
    !!definition &&
    Number.isInteger(definition.startDay) &&
    Number.isInteger(definition.startMonth) &&
    Number.isInteger(definition.endDay) &&
    Number.isInteger(definition.endMonth)
  );
}

/**
 * The occurrence containing `date`, or `null` in a gap (or when either argument
 * is missing or half-typed — "unknown", not "covered").
 */
export function seasonOccurrenceContaining(
  date: string | null | undefined,
  definition: SeasonDefinitionLike | null | undefined
): SeasonOccurrenceRange | null {
  const day = dayKey(date);
  if (day.length !== 10 || !validDefinition(definition)) return null;
  const year = Number(day.slice(0, 4));

  if (!seasonWrapsYear(definition)) {
    const occurrence = occurrenceStarting(year, definition);
    return occurrence.startDate <= day && day <= occurrence.endDate ? occurrence : null;
  }
  if (day >= clampDay(year, definition.startMonth, definition.startDay)) {
    return occurrenceStarting(year, definition);
  }
  if (day <= clampDay(year, definition.endMonth, definition.endDay)) {
    return occurrenceStarting(year - 1, definition);
  }
  return null;
}

/** The first occurrence whose start is strictly after `date`. */
export function nextSeasonOccurrence(
  date: string | null | undefined,
  definition: SeasonDefinitionLike | null | undefined
): SeasonOccurrenceRange | null {
  const day = dayKey(date);
  if (day.length !== 10 || !validDefinition(definition)) return null;
  const year = Number(day.slice(0, 4));
  for (const candidate of [year, year + 1, year + 2]) {
    const occurrence = occurrenceStarting(candidate, definition);
    if (occurrence.startDate > day) return occurrence;
  }
  return null;
}

/** The coach's own label, else "2026/2027" for a wrapping occurrence and "2026" inside one year. */
export function seasonOccurrenceLabel(occurrence: SeasonOccurrenceRange, label?: string | null): string {
  if (label) return label;
  const startYear = occurrence.startDate.slice(0, 4);
  const endYear = occurrence.endDate.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}/${endYear}`;
}
