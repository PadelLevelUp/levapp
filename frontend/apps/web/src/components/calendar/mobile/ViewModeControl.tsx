import { useTranslation } from "react-i18next";
import type { CalendarViewMode } from "@levelup/hooks";
import { cn } from "@/lib/utils";

const MODES: CalendarViewMode[] = ["day", "week", "month"];

/**
 * `Dia | Semana | Mês` — calendar.mobile-views rule 1.
 *
 * The active segment is the navy pill (`sidebar` tokens, navy in both
 * themes); idle segments are text only. A mode that has not shipped yet
 * renders but cannot be chosen — Semana lands in PAD-247, Mês in PAD-248 —
 * so the control's shape is final from the first ticket.
 */
export function ViewModeControl({
  value,
  onChange,
  enabled,
}: {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
  enabled: CalendarViewMode[];
}) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t("calendar.views.label")}
      className="flex gap-1 border-b border-border bg-card px-4 py-2.5"
    >
      {MODES.map((mode) => {
        const isEnabled = enabled.includes(mode);
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            data-testid={`calendar-view-${mode}`}
            aria-selected={isActive}
            aria-disabled={!isEnabled || undefined}
            title={!isEnabled ? t("calendar.views.comingSoon") : undefined}
            onClick={() => {
              if (isEnabled) onChange(mode);
            }}
            className={cn(
              "h-[30px] flex-1 rounded-lg text-xs font-semibold transition-colors",
              isActive
                ? "bg-sidebar text-sidebar-foreground"
                : "text-muted-foreground hover:bg-muted",
              !isEnabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
            )}
          >
            {t(`calendar.views.${mode}`)}
          </button>
        );
      })}
    </div>
  );
}
