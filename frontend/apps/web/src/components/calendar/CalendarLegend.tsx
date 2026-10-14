import { useTranslation } from "react-i18next";
import type * as React from "react";
import {
  cardSurfaceWeb,
  STUDENT_FILTER_DEFAULT,
  studentLegendItems,
  type StudentCalendarFilter,
} from "@levelup/config";
import { cn } from "@/lib/utils";
import { useCalendarViewer } from "./viewer-context";

/**
 * The grid encodes three variables at once — status, fill and level — so the
 * legend says what the treatments mean. Without it the states are guessable
 * but not readable, which is the whole failure the re-encoding set out to fix.
 *
 * The swatches show the TREATMENT, not a fixed palette: the class colour is
 * whatever the coach picked, so each sample uses a neutral stand-in and the
 * distinction carried is the border, the fade and the ring.
 */
export function CalendarLegend({
  className,
  studentFilter = STUDENT_FILTER_DEFAULT,
}: { className?: string; studentFilter?: StudentCalendarFilter } = {}) {
  const { t } = useTranslation();
  const viewer = useCalendarViewer();
  // PAD-664 (calendar.view rule 23): a student's legend lists the states the filter leaves
  // visible, each swatch painted with the same shared surface as its card.
  if (viewer === "student") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
          className
        )}
        data-testid="calendar-legend"
      >
        {studentLegendItems(studentFilter).map((item) => (
          <span
            key={item.variant}
            className="flex items-center gap-1.5"
            data-testid="calendar-legend-item"
            data-variant={item.variant}
          >
            <span
              aria-hidden="true"
              className="h-3 w-5 rounded-sm"
              style={cardSurfaceWeb(undefined, item.variant, "student")}
            />
            {t(item.key)}
          </span>
        ))}
      </div>
    );
  }
  const items: { key: string; testId?: string; label: string; swatch: React.ReactNode }[] = [
    {
      key: "next",
      label: t("calendar.legend.next", { defaultValue: "Next class" }),
      // White body, the class's own colour as its border.
      swatch: (
        <span className="h-3 w-5 rounded-sm border-2 border-muted-foreground/70 bg-card" />
      ),
    },
    {
      key: "full",
      label: t("calendar.legend.full", { defaultValue: "Full / upcoming" }),
      swatch: <span className="h-3 w-5 rounded-sm bg-muted-foreground/70" />,
    },
    {
      key: "done",
      label: t("calendar.legend.done", { defaultValue: "Finished" }),
      // Colour drained toward grey.
      swatch: <span className="h-3 w-5 rounded-sm bg-muted-foreground/20" />,
    },
    {
      key: "event",
      label: t("calendar.legend.event", { defaultValue: "Event / not a class" }),
      swatch: (
        <span className="h-3 w-5 rounded-sm border border-dashed border-muted-foreground/50 bg-muted" />
      ),
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className
      )}
      data-testid="calendar-legend"
    >
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5" data-testid={item.testId}>
          {item.swatch}
          {item.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="flex h-1.5 w-8 overflow-hidden rounded-full bg-border">
          <span className="h-full w-1/2 bg-primary" />
          <span className="h-full w-1/4 bg-primary/40" />
        </span>
        {t("calendar.legend.fill", {
          defaultValue: "Confirmed / awaiting / free",
        })}
      </span>
    </div>
  );
}
