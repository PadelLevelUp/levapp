/**
 * B-275 (PAD-508): a class time is a real `HH:MM` (00:00–23:59). The web sheets' native time input reads
 * "" once a segment is cleared; a sheet must never send that — it flags the field instead. The server
 * refuses the same values (lesson_service `_is_hh_mm`).
 */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHhMm(value: unknown): value is string {
  return typeof value === "string" && HH_MM.test(value);
}

/**
 * PAD-508 (classes.create rule 8b, classes.edit rule 7b): both times are real and the end comes after
 * the start. iOS's new-class screen already refuses an earlier end ("Tem de ser depois da hora de
 * início"); the web sheets do the same before sending.
 */
export function endsAfterStart(start: unknown, end: unknown): boolean {
  return isHhMm(start) && isHhMm(end) && end > start;
}
