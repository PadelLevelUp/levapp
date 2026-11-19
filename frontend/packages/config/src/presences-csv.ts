import { clubTodayISO } from "./club-date";

/**
 * The Presences export's file name, stamped with the club's day (attendance.validation rule 17):
 * a coach exporting monthly ends up with distinct files rather than `presences(3).csv`. The UTC
 * date is a day early late on a summer evening, so it reads the club's clock. Web and iOS share it.
 */
export function presencesCsvFileName(now: Date = new Date()): string {
  return `presences-${clubTodayISO(now)}.csv`;
}
