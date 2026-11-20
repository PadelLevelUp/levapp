import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarX, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceChart } from "@/components/attendance/AttendanceChart";
import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { AbsenceJustificationBadge } from "@/components/attendance/AbsenceJustificationBadge";
import { presetRange, type AttendanceRangePreset } from "@/components/attendance/dateRanges";
import { getAttendanceHistory } from "@/api/attendance";
import { getAbsenceHistory } from "@/api/absences";
import { getSeason } from "@/api/seasons";
import type { AttendanceHistory, SeasonOccurrence } from "@/types";
import { cn } from "@/lib/utils";

/** const:PROFILE_PERIOD_PRESETS / PROFILE_PERIOD_DEFAULT (players.profile rule 12). */
const PERIODS: Array<{ key: AttendanceRangePreset; labelKey: string; ariaKey: string }> = [
  { key: "1w", labelKey: "attendance.ranges.week", ariaKey: "attendance.ranges.weekAria" },
  { key: "1m", labelKey: "attendance.ranges.month", ariaKey: "attendance.ranges.monthAria" },
  { key: "1y", labelKey: "attendance.ranges.year", ariaKey: "attendance.ranges.yearAria" },
  { key: "season", labelKey: "attendance.ranges.season", ariaKey: "attendance.ranges.seasonAria" },
];
const DEFAULT_PERIOD: AttendanceRangePreset = "1m";

type Kind = "attendance" | "absences";

/** One history read per kind and period; an older period's answer never replaces a newer one. */
function useKindHistory(kind: Kind, playerId: string, from: string, to: string) {
  const [data, setData] = useState<AttendanceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const read = kind === "attendance" ? getAttendanceHistory : getAbsenceHistory;
    read({ playerId, from, to })
      .then((next) => { if (!cancelled) setData(next as AttendanceHistory); })
      .catch(() => { if (!cancelled) { setError(true); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, playerId, from, to]);
  return { data, loading, error };
}

/**
 * players.profile rule 12 (PAD-834): Block 3, Assiduidade. Presenças (left) and Faltas (right)
 * under one row of period chips that applies to both. Each card: the server's total and bucket
 * chart for the period, and a toggle that lists the period's sessions inside the card (no
 * navigation); an open list ends with "Ver página completa", where the custom range lives
 * (decision D6). A card whose total is 0 says so and its toggle is disabled. No rate (D5).
 */
export function PlayerAttendanceBlock({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<AttendanceRangePreset>(DEFAULT_PERIOD);
  const [season, setSeason] = useState<SeasonOccurrence | null>(null);
  const [open, setOpen] = useState<Record<Kind, boolean>>({ attendance: false, absences: false });

  // calendar.seasons rule 14: "Época" only when the coach's season has a current occurrence.
  useEffect(() => {
    let cancelled = false;
    getSeason()
      .then((definition) => { if (!cancelled) setSeason(definition?.current ?? null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // Another player starts closed, on the default period.
  useEffect(() => {
    setOpen({ attendance: false, absences: false });
    setPeriod(DEFAULT_PERIOD);
  }, [playerId]);

  const range = useMemo(() => presetRange(period, undefined, season), [period, season]);
  const attendance = useKindHistory("attendance", playerId, range.from, range.to);
  const absences = useKindHistory("absences", playerId, range.from, range.to);
  const periods = PERIODS.filter((p) => p.key !== "season" || season !== null);

  const card = (kind: Kind, history: ReturnType<typeof useKindHistory>) => {
    const isAttendance = kind === "attendance";
    const total = history.data?.total ?? 0;
    const empty = !history.loading && !history.error && total === 0;
    const listOpen = open[kind] && !empty;
    return (
      <section
        className="space-y-3 rounded-lg border p-4"
        data-testid={isAttendance ? "profile-attendance-card" : "profile-absences-card"}
        data-total={history.data ? total : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {isAttendance ? <CalendarCheck className="h-4 w-4" /> : <CalendarX className="h-4 w-4" />}
            {t(isAttendance ? "attendance.title" : "absences.title")}
          </h3>
          <span className="text-sm text-muted-foreground" data-testid={isAttendance ? "profile-attendance-total" : "profile-absences-total"}>
            {t(isAttendance ? "attendance.total" : "absences.total", { count: total })}
          </span>
        </div>
        {empty ? (
          <p className="text-sm text-muted-foreground" data-testid={isAttendance ? "profile-attendance-empty" : "profile-absences-empty"}>
            {t(isAttendance ? "attendance.history.empty" : "absences.history.empty")}
          </p>
        ) : (
          <AttendanceChart
            buckets={history.data?.buckets ?? []}
            granularity={history.data?.granularity ?? "day"}
            loading={history.loading && !history.data}
            error={history.error}
            {...(isAttendance ? {} : { copyNamespace: "absences.chart" as const })}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={empty || history.loading}
          aria-expanded={listOpen}
          onClick={() => setOpen((o) => ({ ...o, [kind]: !o[kind] }))}
          data-testid={isAttendance ? "profile-attendance-toggle" : "profile-absences-toggle"}
        >
          {listOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
          {listOpen ? t("players.card.hideList") : t(isAttendance ? "attendance.playerLink" : "absences.playerLink")}
        </Button>
        {listOpen && (
          <div className="space-y-2" data-testid={isAttendance ? "profile-attendance-list" : "profile-absences-list"}>
            <AttendanceHistoryList
              sessions={history.data?.sessions ?? []}
              testIdPrefix={isAttendance ? "profile-attendance" : "profile-absences"}
              titleKey={isAttendance ? "attendance.history.title" : "absences.history.title"}
              emptyKey={isAttendance ? "attendance.history.empty" : "absences.history.empty"}
              {...(isAttendance ? {} : { renderBadge: (s) => <AbsenceJustificationBadge session={s} /> })}
            />
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => navigate(`/players/${playerId}/${isAttendance ? "attendance" : "absences"}`)}
              data-testid={isAttendance ? "profile-attendance-full" : "profile-absences-full"}
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              {t("players.card.fullPage")}
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <Card data-testid="profile-attendance-block">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">{t("players.card.attendanceTitle")}</CardTitle>
        <div className="flex gap-1" role="group" aria-label={t("players.card.periodAria")} data-testid="profile-period">
          {periods.map((p) => (
            <Button
              key={p.key}
              type="button"
              size="sm"
              variant={period === p.key ? "default" : "outline"}
              aria-pressed={period === p.key}
              aria-label={t(p.ariaKey)}
              onClick={() => setPeriod(p.key)}
              data-testid={`profile-period-${p.key}`}
              className={cn("h-8 px-3")}
            >
              {t(p.labelKey)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {card("attendance", attendance)}
          {card("absences", absences)}
        </div>
      </CardContent>
    </Card>
  );
}
