import { format } from "date-fns";

import { resolveDateLocale } from "./dateLocale";

/** What a class needs to say when it happened: the stored digits, a naive ISO string each. */
export interface ClassWhenLike {
  startDatetime: string;
  endDatetime?: string | null;
}

/**
 * attendance.validation rule 29 (PAD-924): "seg 09/11 · 10:30–12:00" — the weekday in the app's
 * language, dd/mm and the time range, so same-named classes can be told apart. The digits are the
 * stored ones, read as they are with no zone conversion (rule 15): a late class never moves day.
 * Without an end it prints the start alone.
 */
export function classWhenLabel(klass: ClassWhenLike, language?: string): string {
  const [y, m, d] = klass.startDatetime.slice(0, 10).split("-").map(Number);
  // A local Date built from the stored calendar day: only its weekday name is read, never its clock.
  const weekday = format(new Date(y, m - 1, d), "EEE", { locale: resolveDateLocale(language) });
  const day = `${weekday} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  const start = klass.startDatetime.slice(11, 16);
  const end = klass.endDatetime ? klass.endDatetime.slice(11, 16) : "";
  return `${day} · ${end ? `${start}–${end}` : start}`;
}

/** Oldest start first. Stored digits sort as text; a stable copy, the input is left as it is. */
export function sortClassesByStart<T extends { startDatetime: string }>(classes: readonly T[]): T[] {
  return [...classes].sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));
}
