import { format, isSameDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dateLocale";
import { dateCircleClass, dayAbbrClass } from "./DayStrip";
import { isClubToday } from "@levelup/config";

/** Width of the hour-label gutters the columns must line up with (rule 12). */
export const GUTTER_PX = 26;

/**
 * The Semana day header row — calendar.mobile-views rule 12: seven columns
 * over the grid's gutters, each an abbreviation and a 26px date circle with
 * the same states as the Dia strip. Keeps `calendar-day-<key>` so the shared
 * Maestro subflow and the phone specs can select a day in either mode.
 */
export function WeekHeaderRow({
  weekDays,
  selectedDay,
  onSelectDay,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
}) {
  const { i18n } = useTranslation();
  const locale = dateFnsLocale(i18n.language);

  return (
    <div className="flex border-b border-border bg-card">
      <div style={{ width: GUTTER_PX }} className="shrink-0" />
      {weekDays.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const selected = isSameDay(day, selectedDay);
        const today = isClubToday(day);
        return (
          <button
            key={key}
            type="button"
            data-testid={`calendar-day-${key}`}
            aria-pressed={selected}
            aria-label={format(day, "EEE d MMMM", { locale })}
            onClick={() => onSelectDay(day)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 pb-2 pt-2.5",
              selected && "bg-secondary"
            )}
          >
            <span className={cn("text-[9.5px]", dayAbbrClass(selected))}>
              {format(day, "EEE", { locale }).replace(/\.$/, "")}
            </span>
            <span className={cn("h-[26px] w-[26px] text-[13px]", dateCircleClass(selected, today))}>
              {format(day, "d")}
            </span>
          </button>
        );
      })}
      <div style={{ width: GUTTER_PX }} className="shrink-0" />
    </div>
  );
}
