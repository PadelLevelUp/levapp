import { addMonths, format } from "date-fns";
import { parseISODate } from "@levelup/config";

/**
 * B-060: a bare `YYYY-MM-DD` is a calendar date. `new Date("YYYY-MM-DD")` is
 * UTC midnight, which is the previous local day anywhere west of UTC.
 */
export function weekdayOfIsoDate(iso: string): number {
  return parseISODate(iso).getDay();
}

export function addMonthsToIsoDate(iso: string, months: number): string {
  return format(addMonths(parseISODate(iso), months), "yyyy-MM-dd");
}
