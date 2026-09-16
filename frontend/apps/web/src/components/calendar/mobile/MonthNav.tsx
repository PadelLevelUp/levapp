import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The Mês nav row — calendar.mobile-views rule 15: `‹ Setembro 2026 ›`, the
 * label in the active language (from `useCalendar`).
 */
export function MonthNav({
  monthLabel,
  onPrev,
  onNext,
}: {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-4 border-b border-border bg-card px-4 py-3">
      <button
        type="button"
        data-testid="calendar-month-prev"
        aria-label={t("calendar.month.previous")}
        onClick={onPrev}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="min-w-[9rem] text-center text-sm font-semibold text-foreground">
        {monthLabel}
      </h2>
      <button
        type="button"
        data-testid="calendar-month-next"
        aria-label={t("calendar.month.next")}
        onClick={onNext}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
