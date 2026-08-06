import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceSession } from "@/types";
import { parseIsoDate } from "./dateRanges";

/**
 * PAD-114 — the attended-class history below the chart.
 *
 * Each row deep-links into the calendar via the href the server built
 * (`/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>` —
 * `dashboard.navigation` rule 8), so the calendar opens on that class's week
 * with its detail sheet already open. Rows are exposed as buttons and activate
 * with Enter/Space, matching the dashboard class lists (rule 10).
 */
export function AttendanceHistoryList({
  sessions,
}: {
  sessions: AttendanceSession[];
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // UTC-pinned: `date` is the class's UTC day, and re-reading it in the viewer's
  // timezone would shift early/late classes onto the neighbouring day.
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "full",
    timeZone: "UTC",
  });
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("attendance.history.title")}
        </CardTitle>
      </CardHeader>
      {/* The container is always present — an empty period is a state of the
          list, not the absence of one. */}
      <CardContent data-testid="attendance-history-list">
        {sessions.length === 0 ? (
          <p
            data-testid="attendance-history-empty"
            className="py-6 text-center text-sm text-muted-foreground"
          >
            {t("attendance.history.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((session) => {
              const day = parseIsoDate(session.date);
              const dayLabel = dateFmt.format(day);
              // `startDatetime` is naive UTC; treat it as UTC explicitly so the
              // rendered time is the class's actual clock time.
              const timeLabel = timeFmt.format(
                new Date(`${session.startDatetime.slice(0, 19)}Z`)
              );
              const go = () => navigate(session.href);

              return (
                <li key={session.lessonInstanceId}>
                  <div
                    data-testid="attendance-history-item"
                    role="button"
                    tabIndex={0}
                    aria-label={t("attendance.history.openClass", {
                      title: session.title,
                      date: dayLabel,
                    })}
                    onClick={go}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        go();
                      }
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: session.color
                          ? `${session.color}22`
                          : undefined,
                      }}
                    >
                      <CalendarCheck
                        className="h-4 w-4"
                        style={{ color: session.color ?? undefined }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {dayLabel} · {timeLabel}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
