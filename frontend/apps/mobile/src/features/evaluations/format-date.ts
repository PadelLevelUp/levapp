import { format, parseISO } from "date-fns";
import { resolveDateLocale } from "@levelup/config";

/** The server sends `YYYY-MM-DD` (the club's day); the shell only FORMATS it — "21 set 2026". */
export function formatEvaluationDate(isoDay: string, language: string): string {
  return format(parseISO(isoDay), "d MMM yyyy", { locale: resolveDateLocale(language) });
}
