/**
 * classes.class-requests rule 21 (criterion 67): the one line that opens the last step of the private class,
 * naming the earlier answers: the people, then the date, or the weekdays and the last date. Pure: the words come
 * from the `classRequestWizard.summary` keys through the caller's `t`.
 */
export type SummaryT = (key: string, vars?: Record<string, string | number>) => string;

export type PrivateRequestSummaryInput = {
  people: number;
  /** The usernames given for the other people, as typed. */
  invitees: string[];
  recurring: "single" | "weekly";
  /** The single class's date, `YYYY-MM-DD`. */
  date: string;
  /** 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  /** The weekly request's last date, `YYYY-MM-DD`. */
  endDate: string;
};

/** ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD`. */
function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function dayAndMonth(iso: string, t: SummaryT): { day: number; month: string } {
  const [, m, d] = iso.split("-").map(Number);
  return { day: d, month: t(`summary.months.${m}`) };
}

export function privateRequestSummary(a: PrivateRequestSummaryInput, t: SummaryT): string {
  const names = a.invitees.map((n) => n.trim()).filter(Boolean);
  const people = a.people <= 1 ? t("summary.justMe") : [t("summary.people", { count: a.people }), names.join(", ")].filter(Boolean).join(" · ");
  if (a.recurring === "weekly") {
    const weekdays = [...a.weekdays].sort((x, y) => x - y).map((d) => t(`summary.weekdays.${d}`)).join(", ");
    const { day, month } = dayAndMonth(a.endDate, t);
    return `${people} · ${t("summary.weekly", { weekdays, day, month })}`;
  }
  const { day, month } = dayAndMonth(a.date, t);
  return `${people} · ${t("summary.single", { weekday: t(`summary.weekdays.${isoWeekday(a.date)}`), day, month })}`;
}
