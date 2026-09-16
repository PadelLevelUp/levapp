import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The Semana nav row — calendar.mobile-views rule 11: a `Hoje` pill on the
 * left, then the week range between chevrons. The range label is the
 * locale-aware one `useCalendar` derives (calendar.view rule 12), kept as an
 * `<h2>` because the PAD-58 compactness spec reads it there.
 */
export function WeekNav({
  weekLabel,
  onToday,
  onPrev,
  onNext,
}: {
  weekLabel: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-card px-4 py-3">
      <button
        type="button"
        data-testid="calendar-today"
        onClick={onToday}
        className="h-[34px] shrink-0 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground hover:bg-muted"
      >
        {t("calendar.toolbar.today")}
      </button>
      <div className="flex flex-1 items-center justify-center gap-4">
        <button
          type="button"
          data-testid="calendar-prev-week"
          aria-label={t("calendar.toolbar.previousWeek")}
          onClick={onPrev}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold tabular-nums text-foreground">{weekLabel}</h2>
        <button
          type="button"
          data-testid="calendar-next-week"
          aria-label={t("calendar.toolbar.nextWeek")}
          onClick={onNext}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
