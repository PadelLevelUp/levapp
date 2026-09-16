import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { dateFnsLocale } from "@/lib/dateLocale";

/**
 * The selected day, spelled out — calendar.mobile-views rule 3.
 *
 * Navy circle with the day number, the full weekday and date in the active
 * language, and how many things are on. The heading stays an `<h3>`: the
 * `i18n-date-locale` spec reads the localised date from it.
 */
export function DayHeader({ day, count }: { day: Date; count: number }) {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocale(i18n.language);

  return (
    <div className="flex items-center gap-3.5 px-5 pb-2 pt-5">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sidebar text-xl font-bold tabular-nums text-sidebar-foreground"
      >
        {format(day, "d")}
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {format(day, "EEEE, d MMMM", { locale })}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("calendar.mobile.classCount", { count })}
        </p>
      </div>
    </div>
  );
}
