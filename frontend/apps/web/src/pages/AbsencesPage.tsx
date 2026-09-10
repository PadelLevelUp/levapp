import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarX } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceChart } from "@/components/attendance/AttendanceChart";
import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { AttendanceRangeControls } from "@/components/attendance/AttendanceRangeControls";
import {
  presetRange,
  type AttendanceRange,
  type AttendanceRangePreset,
} from "@/components/attendance/dateRanges";
import { getAbsenceHistory } from "@/api/absences";
import type { AbsenceHistory, AbsenceSession, AttendanceSession } from "@/types";

/**
 * PAD-141 — "Faltas", the absence-history page (spec `attendance.absences`).
 *
 * One component, two entry points, mirroring PAD-114's attendance page:
 *   * `/absences`                   — the signed-in student's own absences
 *   * `/players/:playerId/absences` — a coach viewing one roster player
 *
 * A thin page over the SAME chart / range-control / list components the
 * attendance page uses, rather than a `variant` prop threaded through that page:
 * the two differ in their data source, their copy and their test ids, and every
 * existing `attendance-*` assertion would otherwise depend on a prop value.
 *
 * The `playerId` in the URL is NOT authorization. `GET /absence_history`
 * re-checks the caller server-side with the same resolver as the attendance
 * endpoint and 403s otherwise; the route guard here is only UX.
 */
export default function AbsencesPage() {
  const { playerId } = useParams<{ playerId?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [preset, setPreset] = useState<AttendanceRangePreset>("1m");
  const [customRange, setCustomRange] = useState<AttendanceRange | null>(null);
  const [history, setHistory] = useState<AbsenceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const range = useMemo(
    () => customRange ?? presetRange(preset),
    [customRange, preset]
  );

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      setError(false);
      try {
        const data = await getAbsenceHistory({
          playerId: playerId ?? undefined,
          from: range.from,
          to: range.to,
        });
        if (!signal.cancelled) setHistory(data);
      } catch {
        if (!signal.cancelled) {
          setError(true);
          setHistory(null);
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [playerId, range.from, range.to]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const isCoachView = Boolean(playerId);
  const subjectName = history?.playerName ?? "";

  /**
   * Justified / unjustified, per row. Presentational only — it never filters
   * the list, because the dashboard "Missed" KPI counts both and the page must
   * agree with the card that links to it (spec rule 3).
   */
  const renderJustification = (session: AttendanceSession) => {
    const justification = (session as AbsenceSession).justification;
    if (!justification) return null;
    const justified = justification === "justified";
    return (
      <span
        data-testid="absences-justification"
        data-justification={justification}
        className={
          justified
            ? "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            : "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
        }
      >
        {justified
          ? t("absences.justified")
          : t("absences.unjustified")}
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="sm"
            data-testid="absences-back"
            onClick={() =>
              navigate(isCoachView ? `/players/${playerId}` : "/dashboard")
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isCoachView
              ? t("absences.backToPlayer")
              : t("absences.backToDashboard")}
          </Button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("absences.title")}
          </h1>
          <p
            data-testid="absences-subject"
            className="text-sm text-muted-foreground"
          >
            {isCoachView
              ? t("absences.subtitleOther", { name: subjectName })
              : t("absences.subtitleOwn")}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-base">
              {t("absences.chart.title")}
            </CardTitle>
            <span
              data-testid="absences-total"
              className="text-sm text-muted-foreground"
            >
              {t("absences.total", { count: history?.total ?? 0 })}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <AttendanceChart
              buckets={history?.buckets ?? []}
              granularity={history?.granularity ?? "day"}
              loading={loading && !history}
              error={error}
              copyNamespace="absences.chart"
            />
            <AttendanceRangeControls
              preset={preset}
              customRange={customRange}
              onSelectPreset={(next) => {
                setCustomRange(null);
                setPreset(next);
              }}
              onApplyCustom={(next) => setCustomRange(next)}
              onClearCustom={() => setCustomRange(null)}
            />
          </CardContent>
        </Card>

        <AttendanceHistoryList
          sessions={history?.sessions ?? []}
          testIdPrefix="absences"
          titleKey="absences.history.title"
          emptyKey="absences.history.empty"
          icon={<CalendarX className="h-4 w-4 text-muted-foreground" />}
          renderBadge={renderJustification}
        />
      </div>
    </AppLayout>
  );
}
