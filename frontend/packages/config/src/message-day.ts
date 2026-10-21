/**
 * PAD-676 (messaging.conversation-detail rule 4a): the day separators of a conversation, one
 * function for web and mobile so the two never diverge again.
 *
 * Messages are grouped by their date on the club's clock (Europe/Lisbon, `clubDateOfInstant`),
 * never by UTC, so a message at 00:30 belongs to the day it was sent. Labels:
 * today → "Hoje"; yesterday → "Ontem"; 2–6 days ago → the weekday ("Terça-feira");
 * older → "12 out", with the year when it is not this year ("12 out 2025").
 * The names are tables, not `Intl` or date-fns (`dateLocale`), so Hermes and every browser print
 * the same words — a shared formatter whose output depends on the runtime is how the two apps
 * diverged in the first place.
 */
import { clubDateOfInstant, clubTodayISO } from "./club-date";

const WEEKDAYS: Record<"pt" | "en", readonly string[]> = {
  // Indexed by `Date.getUTCDay()`: 0 = Sunday.
  pt: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const MONTHS: Record<"pt" | "en", readonly string[]> = {
  pt: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

export interface MessageDayLabelOptions {
  /** The UI language; anything not starting with "en" reads Portuguese (the web's fallback). */
  language: string;
  /** Already-translated "today" / "yesterday", e.g. `t("messages.today")`. */
  todayLabel: string;
  yesterdayLabel: string;
  now?: Date;
}

/** The club's date (`YYYY-MM-DD`) a message belongs to — the key separators group by. */
export function messageDayKey(timestamp: string): string {
  return clubDateOfInstant(timestamp);
}

function utcMidnight(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The separator label for the club date `dayKey` (`YYYY-MM-DD`), as of `now`. */
export function messageDayLabel(dayKey: string, options: MessageDayLabelOptions): string {
  // An unparsable timestamp gives no day: no label rather than "NaN undefined".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return "";
  const lang = options.language.toLowerCase().startsWith("en") ? "en" : "pt";
  const today = clubTodayISO(options.now ?? new Date());
  const daysAgo = Math.round((utcMidnight(today) - utcMidnight(dayKey)) / 86_400_000);
  // A message stamped a little ahead of this device's clock is still today's.
  if (daysAgo <= 0) return options.todayLabel;
  if (daysAgo === 1) return options.yesterdayLabel;
  const date = new Date(utcMidnight(dayKey));
  if (daysAgo < 7) return WEEKDAYS[lang][date.getUTCDay()];
  const day = date.getUTCDate();
  const month = MONTHS[lang][date.getUTCMonth()];
  const label = lang === "en" ? `${month} ${day}` : `${day} ${month}`;
  if (dayKey.slice(0, 4) === today.slice(0, 4)) return label;
  return lang === "en" ? `${label}, ${dayKey.slice(0, 4)}` : `${label} ${dayKey.slice(0, 4)}`;
}

/**
 * Consecutive runs of `items` (oldest first, as both lists render) that share a club date — one
 * separator above each run. Web renders the groups; iOS marks each group's first message.
 */
export function groupByDay<T>(items: readonly T[], timestampOf: (item: T) => string): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = messageDayKey(timestampOf(item));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
