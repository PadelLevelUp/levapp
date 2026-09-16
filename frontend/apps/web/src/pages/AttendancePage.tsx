import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

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
import { getAttendanceHistory } from "@/api/attendance";
import { getSeason } from "@/api/seasons";
import type { SeasonOccurrence } from "@/types";
import type { AttendanceHistory } from "@/types";

/**
 * PAD-114 — "Presenças", the attendance-history page (spec `attendance.history`).
 *
 * One component, two entry points:
 *   * `/attendance`                   — the signed-in student's own history
 *   * `/players/:playerId/attendance` — a coach viewing one roster player
 *
 * The `playerId` in the URL is NOT authorization. `GET /attendance_history`
 * re-checks the caller server-side (self, or a coach with an
 * Association_CoachPlayer row) and 403s otherwise — the route guard here is only
 * UX. PAD-88 / PAD-115 are the precedent for not conflating the two.
 */
export default function AttendancePage() {
  const { playerId } = useParams<{ playerId?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [preset, setPreset] = useState<AttendanceRangePreset>("1m");
  const [customRange, setCustomRange] = useState<AttendanceRange | null>(null);
  // calendar.seasons rule 14: a coach reading a player's history gets a
  // "Season" preset fed by their own definition's current occurrence.
  const coachView = Boolean(playerId);
  const [season, setSeason] = useState<SeasonOccurrence | null>(null);
  useEffect(() => {
    if (!coachView) return;
    let cancelled = false;
    getSeason()
      .then((definition) => {
        if (!cancelled) setSeason(definition?.current ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [coachView]);
  const [history, setHistory] = useState<AttendanceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const range = useMemo(
    () => customRange ?? presetRange(preset, undefined, season),
    [customRange, preset, season]
  );

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      setError(false);
      try {
        const data = await getAttendanceHistory({
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

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="sm"
            data-testid="attendance-back"
            onClick={() =>
              navigate(isCoachView ? `/players/${playerId}` : "/dashboard")
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isCoachView
              ? t("attendance.backToPlayer")
              : t("attendance.backToDashboard")}
          </Button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("attendance.title")}
          </h1>
          <p
            data-testid="attendance-subject"
            className="text-sm text-muted-foreground"
          >
            {isCoachView
              ? t("attendance.subtitleOther", { name: subjectName })
              : t("attendance.subtitleOwn")}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-base">
              {t("attendance.chart.title")}
            </CardTitle>
            <span
              data-testid="attendance-total"
              className="text-sm text-muted-foreground"
            >
              {t("attendance.total", { count: history?.total ?? 0 })}
            </span>
          </CardHeader>
          {/* Chart on top, range controls directly below it (spec rule 10). */}
          <CardContent className="space-y-4">
            <AttendanceChart
              buckets={history?.buckets ?? []}
              granularity={history?.granularity ?? "day"}
              loading={loading && !history}
              error={error}
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
              seasonAvailable={Boolean(season)}
            />
          </CardContent>
        </Card>

        <AttendanceHistoryList sessions={history?.sessions ?? []} />
      </div>
    </AppLayout>
  );
}
