import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useCoachRoster,
  useInvalidatePresences,
  usePendingValidation,
  usePendingValidationCount,
  usePresenceStats,
  usePresenceTrend,
} from "@levelup/hooks";
import { CalendarCheck, TrendingUp, UserCheck, Users } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PresenceCharts } from "@/components/presences/PresenceCharts";
import { PresencePlayersTable } from "@/components/presences/PresencePlayersTable";
import {
  ValidateClassesDialog,
  type RosterOption,
} from "@/components/presences/ValidateClassesDialog";
import { unvalidateClass, validateClassPresences } from "@/api/presences";
import { toIsoDate, weekBounds } from "@/components/attendance/dateRanges";
import type { PresencePlayerStats } from "@/types";
import { chartScope, narrowedTotals } from "@levelup/config";


/**
 * `?week=<offset>` — the dashboard's validation card lands here on the week it
 * counted (dashboard.navigation rule 9a). Anything unparseable is the current week.
 */
function initialWeekOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * PAD-140 — "Presenças", the coach's attendance overview.
 *
 * Coach-only. Composes four blocks over three endpoints:
 *   * the validation inbox (week-scoped, its own query)
 *   * KPI tiles and the players table (roster stats, window-scoped)
 *   * three charts (roster stats + the trend series)
 *
 * The stats window and the validation week are deliberately independent: a
 * coach validating last week's classes should not have the whole page's
 * statistics jump around underneath them.
 *
 * PAD-192 (attendance.validation rule 17a): the table's filters are page-level.
 * The ranking and the academy/private split re-derive from the filtered rows
 * client-side; the over-time series is re-requested with the filtered player
 * ids (debounced), and roster-wide again once the filters clear.
 */
const TREND_DEBOUNCE_MS = 300;

export default function PresencesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  // PAD-443 (attendance.validation rule 23): every write moves the Presences badge, so refresh it
  // after each one, including a bulk run that stopped part-way.
  const queryClient = useQueryClient();
  const refreshBadge = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.pendingValidationBadge }),
    [queryClient]
  );

  const invalidatePresences = useInvalidatePresences();
  // What a presence write moves beyond the presences reads: the Presences badge and the dashboard's
  // validation card (client.query-cache: a mutation invalidates the keys it changes).
  const refreshAfterWrite = useCallback(async () => {
    await invalidatePresences();
    refreshBadge();
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [invalidatePresences, refreshBadge, queryClient]);

  // `null` = no filter active: the charts show the whole roster.
  const [filteredPlayers, setFilteredPlayers] = useState<PresencePlayerStats[] | null>(null);

  const [searchParams] = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(() =>
    initialWeekOffset(searchParams.get("week"))
  );
  // PAD-283 (dashboard.blocks rule 10): the dashboard's validation card lands
  // here with `validate=1`, so the coach is inside the validate view at once.
  const [openValidate] = useState(() => searchParams.get("validate") === "1");
  // PAD-191 (B-033): the SET of classes in flight, not just the first — every
  // queued class stays disabled for the whole bulk run.
  const [busyClassIds, setBusyClassIds] = useState<number[]>([]);

  const week = useMemo(() => weekBounds(weekOffset), [weekOffset]);

  // client.query-cache rule 6: the page reads through the shared hooks; the cache is what makes a
  // return inside the stale window instant, and a write invalidates the keys it changes.
  const statsQuery = usePresenceStats();
  const stats = statsQuery.data ?? null;
  const loadingStats = statsQuery.isPending;

  // The over-time chart follows the filters through the server (rule 17a): the series is requested
  // for the visible players, debounced per keystroke, and is the roster-wide one when the filters
  // clear. ONE hook call keyed on the filter (rule 8: the trend is requested once on load).
  const filteredIdsKey = filteredPlayers
    ? filteredPlayers.map((p) => p.playerId).sort((a, b) => a - b).join(",")
    : null;
  const [trendPlayerIds, setTrendPlayerIds] = useState<number[] | undefined>(undefined);
  useEffect(() => {
    if (filteredIdsKey === null) {
      setTrendPlayerIds(undefined);
      return;
    }
    const ids = filteredIdsKey === "" ? [] : filteredIdsKey.split(",").map(Number);
    const handle = window.setTimeout(() => setTrendPlayerIds(ids), TREND_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [filteredIdsKey]);
  // The previous series stays on screen while the next one arrives (rule 5).
  const trendQuery = usePresenceTrend(trendPlayerIds, { placeholderData: keepPreviousData });
  const trend = trendQuery.data ?? null;

  useEffect(() => {
    if (!statsQuery.isError && !(trendPlayerIds === undefined && trendQuery.isError)) return;
    toast({
      title: t("presences.error.statsTitle"),
      description: t("presences.error.statsBody"),
      variant: "destructive",
    });
    // One toast per failure, not per identity change of `t` / `toast`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsQuery.isError, trendQuery.isError]);

  // The trigger's number comes from the count endpoint — the same helper the dashboard card reads —
  // never from `pending.length` (B-045). Both are keyed on the week and share the
  // `presence-pending` prefix, so every write refreshes them together.
  const queueQuery = usePendingValidation(week);
  const countQuery = usePendingValidationCount(week);
  const queue = queueQuery.data ?? null;
  const pendingCount = countQuery.data?.pendingCount ?? null;
  // PAD-539: the whole backlog, the trigger's number (attendance.validation rule 18).
  const pendingTotal = countQuery.data?.pendingTotal ?? null;
  const loadingQueue = queueQuery.isPending || countQuery.isPending;
  useEffect(() => {
    if (!queueQuery.isError && !countQuery.isError) return;
    toast({
      title: t("presences.error.queueTitle"),
      description: t("presences.error.queueBody"),
      variant: "destructive",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueQuery.isError, countQuery.isError]);

  // `playerId`, not `id` — the latter is the coach↔player association's own id, which no presence
  // endpoint accepts. A failed roster load only costs the walk-in picker; the rest of the page is
  // still useful, so it stays silent rather than alarming.
  const rosterQuery = useCoachRoster();
  const roster = useMemo<RosterOption[]>(
    () =>
      (rosterQuery.data ?? []).map((p) => ({
        id: Number(p.playerId),
        name: p.name || t("presences.unknownPlayer"),
      })),
    [rosterQuery.data, t]
  );

  const handleValidate = useCallback(
    async (
      classes: Array<{
        lessonInstanceId: number;
        presences: Array<{
          playerId: number;
          status: "present" | "absent";
          justification?: "justified" | "unjustified";
        }>;
      }>
    ) => {
      setBusyClassIds(classes.map((c) => c.lessonInstanceId));
      try {
        // Sequential rather than parallel: each call can materialize rows and
        // touch the same instance, and a coach validating a handful of classes
        // is not a throughput problem.
        for (const item of classes) {
          await validateClassPresences(item.lessonInstanceId, item.presences);
        }
        toast({
          title: t("presences.toast.validated", { count: classes.length }),
        });
      } catch {
        toast({
          title: t("presences.error.validateTitle"),
          description: t("presences.error.validateBody"),
          variant: "destructive",
        });
      } finally {
        // Also after a bulk run that stopped part-way: the classes already written moved the queue.
        await refreshAfterWrite();
        setBusyClassIds([]);
      }
    },
    [refreshAfterWrite, t, toast]
  );

  const handleUnvalidate = useCallback(
    async (lessonInstanceId: number) => {
      setBusyClassIds([lessonInstanceId]);
      try {
        await unvalidateClass(lessonInstanceId);
      } catch {
        toast({
          title: t("presences.error.undoTitle"),
          description: t("presences.error.undoBody"),
          variant: "destructive",
        });
      } finally {
        await refreshAfterWrite();
        setBusyClassIds([]);
      }
    },
    [refreshAfterWrite, t, toast]
  );

  const totals = stats?.totals;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("presences.eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("presences.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("presences.subtitle")}
          </p>
        </header>

        <div className="sm:max-w-sm">
          <ValidateClassesDialog
            initialOpen={openValidate}
            pending={queue?.pending ?? []}
            validated={queue?.validated ?? []}
            pendingCount={pendingCount}
            pendingTotal={pendingTotal}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            loading={loadingQueue}
            roster={roster}
            onValidate={handleValidate}
            onUnvalidate={handleUnvalidate}
            busyClassIds={busyClassIds}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={CalendarCheck}
            label={t("presences.kpi.totalPresences")}
            value={totals?.presences}
            loading={loadingStats}
            testId="presences-kpi-total"
          />
          <StatTile
            icon={Users}
            label={t("presences.kpi.activePlayers")}
            value={totals?.activePlayers}
            loading={loadingStats}
            testId="presences-kpi-players"
          />
          <StatTile
            icon={TrendingUp}
            label={t("presences.kpi.academyShare")}
            value={totals ? `${totals.academyShare}%` : undefined}
            loading={loadingStats}
            testId="presences-kpi-academy"
          />
          <StatTile
            icon={UserCheck}
            label={t("presences.kpi.guestAttendances")}
            value={totals?.guestAttendances}
            loading={loadingStats}
            testId="presences-kpi-guests"
          />
        </div>

        <PresenceCharts
          players={filteredPlayers ?? stats?.players ?? []}
          totals={filteredPlayers ? narrowedTotals(filteredPlayers, totals) : totals}
          trend={trend?.buckets ?? []}
          granularity={trend?.granularity ?? "day"}
          loading={loadingStats}
          scope={chartScope(filteredPlayers, stats?.players ?? [])}
        />

        <PresencePlayersTable
          players={stats?.players ?? []}
          loading={loadingStats}
          onFilteredChange={setFilteredPlayers}
        />
      </div>
    </AppLayout>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: number | string;
  loading?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        {loading ? (
          <Skeleton className="mb-1 h-5 w-12" />
        ) : (
          <span
            data-testid={testId}
            className="block text-lg font-semibold tabular-nums"
          >
            {value ?? 0}
          </span>
        )}
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
