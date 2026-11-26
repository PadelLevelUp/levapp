import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { classWhenHeader } from "@levelup/config";

/**
 * calendar.event-detail rule 28 (UI idea 6): reading a class starts with when it is.
 *
 * While the coach edits, this is the old two-column grid and its children are the boxes. While reading (marking
 * attendance and planning are reading), it is one header block, `class-detail-when`: a date tile, the time range
 * in the display face, the series' "until" line, a facts line (level, then club and court) of what exists, and
 * then its children, which are the capacity line (`class-detail-capacity`, rule 27's bar included) — the sheet
 * passes the one capacity box it has, so no count is computed here.
 *
 * The labels the boxes showed stay as the accessible names of the values: read out, not drawn.
 */
export function ClassWhenHeader({
  editing,
  date,
  startTime,
  endTime,
  until,
  levelCode,
  clubName,
  courtName,
  children,
}: {
  editing: boolean;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** The series' end, already worded ("até 30 jun"): only the first occurrence of a series has one. */
  until?: string | null;
  levelCode?: string | null;
  clubName?: string | null;
  courtName?: string | null;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  if (editing) return <div className="grid grid-cols-2 gap-3">{children}</div>;

  const when = classWhenHeader({ date, startTime, endTime }, i18n.language);
  const place = [clubName, courtName].filter(Boolean).join(" · ");
  const hasFacts = !!levelCode || !!place;

  return (
    // The block is its own container: the time is 26px, and 24px when the block is under 320px wide.
    <div data-testid="class-detail-when" className="space-y-3 [container-type:inline-size]">
      <div className="flex items-center gap-3">
        <div role="group" aria-label={t("calendar.detail.date")} className="shrink-0">
          <div
            role="img"
            aria-label={when.spokenDate}
            data-testid="class-detail-date-tile"
            className="flex w-14 flex-col items-center rounded-lg border bg-muted/30 py-1.5 leading-none"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{when.weekday}</span>
            <span className="my-1 font-display text-3xl font-bold tabular-nums">{when.day}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{when.month}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div role="group" aria-label={t("calendar.detail.time")}>
            <p
              data-testid="class-detail-time"
              className="whitespace-nowrap font-display text-[24px] font-semibold leading-tight tracking-tight tabular-nums [@container(min-width:320px)]:text-[26px]"
            >
              {when.timeRange}
            </p>
          </div>
          {until && (
            <p data-testid="class-detail-until" className="mt-0.5 text-xs text-muted-foreground">
              {until}
            </p>
          )}
        </div>
      </div>

      {hasFacts && (
        <p data-testid="class-detail-facts" className="text-sm text-muted-foreground">
          {levelCode && (
            <span data-testid="class-detail-level" className="font-medium text-foreground">
              <span className="sr-only">{t("calendar.detail.level")}: </span>
              {levelCode}
            </span>
          )}
          {levelCode && place && <span aria-hidden="true"> · </span>}
          {place && (
            <span data-testid="class-detail-place">
              <span className="sr-only">{t("calendar.detail.club")}: </span>
              {place}
            </span>
          )}
        </p>
      )}

      {children}
    </div>
  );
}
