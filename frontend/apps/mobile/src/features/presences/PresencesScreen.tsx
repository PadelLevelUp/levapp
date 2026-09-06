import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { PresencePlayerStats } from "@levelup/types";
import { useRouter } from "expo-router";

import { ErrorState } from "@/components/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PresenceReportCharts } from "./PresenceReportCharts";
import {
  PresenceColumnsSheet,
  PresenceFiltersSheet,
} from "./PresenceReportSheets";
import { ValidateClassesSheet } from "./ValidateClassesSheet";
import { sharePresencesCsv } from "./csv-share";
import {
  DEFAULT_SORT,
  DEFAULT_VISIBLE_COLUMNS,
  EMPTY_FILTERS,
  type PresenceColumnKey,
  type PresenceFilters,
  type PresenceSort,
  activeFilterCount,
  buildPresencesCsv,
  csvFileName,
  filterPlayers,
  sortPlayerStats,
  visibleColumns,
} from "./report-state";
import {
  useCoachRoster,
  usePendingValidation,
  usePresenceStats,
  usePresenceTrend,
  useUnvalidateClass,
  useValidateClasses,
  weekBounds,
} from "./hooks";

/**
 * PAD-140 — "Presenças" on iOS. Coach-only. PAD-185 gave it the validate flow,
 * PAD-166 the reporting half.
 *
 * Feature parity with the web tab, adapted to a phone:
 *   * same validation inbox (see `ValidateClassesSheet`)
 *   * same four KPI figures
 *   * the same three charts (PAD-166), stacked rather than in a row and drawn
 *     with `react-native-svg` — see `PresenceReportCharts`
 *   * the players *table* becomes a searchable list — eight numeric columns do
 *     not fit 390pt, so each row leads with the total and shows the visible
 *     ones as labelled chips. Web's toolbar controls (the two numeric filters,
 *     sort, the column chooser, Export CSV) move into a compact button row and
 *     two sheets, because a phone list has no column headings to hang sorting
 *     on and no header row to hold four controls.
 *
 * Those are presentation choices; every number and every action a coach can
 * take on web, they can take here. The filtering, sorting and CSV arithmetic
 * lives in `report-state.ts` so it is unit-testable — the mobile vitest project
 * cannot render a React Native tree.
 */
export function PresencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [filters, setFilters] =
    React.useState<PresenceFilters>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<PresenceSort>(DEFAULT_SORT);
  const [visible, setVisible] = React.useState<PresenceColumnKey[]>(
    DEFAULT_VISIBLE_COLUMNS
  );

  const week = React.useMemo(() => weekBounds(weekOffset), [weekOffset]);
  const stats = usePresenceStats();
  const trend = usePresenceTrend();
  const queue = usePendingValidation(week);
  const roster = useCoachRoster();
  const validate = useValidateClasses();
  const unvalidate = useUnvalidateClass();

  const totals = stats.data?.totals;
  const players = React.useMemo(
    () => stats.data?.players ?? [],
    [stats.data]
  );

  const columns = React.useMemo(() => visibleColumns(visible), [visible]);

  const rows = React.useMemo(
    () => sortPlayerStats(filterPlayers(players, filters), sort),
    [players, filters, sort]
  );

  const filterCount = activeFilterCount(filters);

  const handleExport = React.useCallback(async () => {
    setExporting(true);
    try {
      await sharePresencesCsv({
        // Exactly what the list is showing: the visible columns, the filtered
        // rows, in the current order. A coach who narrowed the list expects the
        // file to be the thing they narrowed it to, not the whole roster.
        csv: buildPresencesCsv(rows, columns, (key) =>
          t(`presences.column.${key}`)
        ),
        fileName: csvFileName(new Date()),
        title: t("presences.table.export"),
      });
    } catch {
      toast.error(t("presences.error.exportBody"));
    } finally {
      setExporting(false);
    }
  }, [rows, columns, t]);

  if (stats.isError) {
    return <ErrorState onRetry={() => void stats.refetch()} />;
  }

  const pendingCount = queue.data?.pending.length ?? 0;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-4">
      <Pressable
        testID="presences-validate-trigger"
        accessibilityRole="button"
        onPress={() => setSheetOpen(true)}
        className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
      >
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Ionicons name="clipboard-outline" size={20} color={lightTheme.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-sans-bold">
            {/* Not a plural form: pt's CLDR "one" category covers 0, so a
                counted string renders "0 aula". */}
            {pendingCount === 0
              ? t("presences.validate.triggerEmpty")
              : t("presences.validate.trigger", { count: pendingCount })}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {t("presences.validate.triggerHint")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={lightTheme.mutedForeground} />
      </Pressable>

      <View className="flex-row flex-wrap gap-3">
        <StatTile
          icon="calendar-outline"
          label={t("presences.kpi.totalPresences")}
          value={totals?.presences}
          loading={stats.isLoading}
          testID="presences-kpi-total"
        />
        <StatTile
          icon="people-outline"
          label={t("presences.kpi.activePlayers")}
          value={totals?.activePlayers}
          loading={stats.isLoading}
          testID="presences-kpi-players"
        />
        <StatTile
          icon="trending-up-outline"
          label={t("presences.kpi.academyShare")}
          value={totals ? `${totals.academyShare}%` : undefined}
          loading={stats.isLoading}
          testID="presences-kpi-academy"
        />
        <StatTile
          icon="person-add-outline"
          label={t("presences.kpi.guestAttendances")}
          value={totals?.guestAttendances}
          loading={stats.isLoading}
          testID="presences-kpi-guests"
        />
      </View>

      <PresenceReportCharts
        players={players}
        totals={totals}
        trend={trend.data?.buckets ?? []}
        granularity={trend.data?.granularity ?? "day"}
        loading={stats.isLoading || trend.isLoading}
        trendError={trend.isError}
      />

      <View className="gap-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-base font-sans-bold">
            {t("presences.table.title")}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {t("presences.table.count", {
              shown: rows.length,
              total: players.length,
            })}
          </Text>
        </View>
        <Input
          value={filters.query}
          onChangeText={(query) =>
            setFilters((prev) => ({ ...prev, query }))
          }
          placeholder={t("presences.table.search")}
          testID="presences-search"
        />

        <View className="flex-row gap-2">
          <ToolbarButton
            icon="funnel-outline"
            label={t("presences.table.filters")}
            // The count is on the button rather than only inside the sheet: a
            // filter the coach forgot about is otherwise indistinguishable
            // from an empty roster.
            badge={filterCount}
            onPress={() => setFiltersOpen(true)}
            testID="presences-filters-trigger"
          />
          <ToolbarButton
            icon="options-outline"
            label={t("presences.table.columns")}
            onPress={() => setColumnsOpen(true)}
            testID="presences-columns-trigger"
          />
          <ToolbarButton
            icon="share-outline"
            label={t("presences.table.export")}
            // Nothing to export and nothing to say about it — a share sheet
            // over a one-line file is worse than a disabled button.
            disabled={exporting || rows.length === 0}
            onPress={() => void handleExport()}
            testID="presences-export"
          />
        </View>

        {stats.isLoading ? (
          <View className="gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </View>
        ) : rows.length === 0 ? (
          <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("presences.table.empty")}
          </Text>
        ) : (
          rows.map((player) => (
            <PlayerRow
              key={player.playerId}
              player={player}
              columns={visible}
              onPress={() => router.push(`/player/${player.playerId}`)}
            />
          ))
        )}
      </View>

      <PresenceFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        sort={sort}
        onApply={({ filters: next, sort: nextOrder }) => {
          setFilters(next);
          setSort(nextOrder);
        }}
      />

      <PresenceColumnsSheet
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        visible={visible}
        onApply={setVisible}
      />

      <ValidateClassesSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        pending={queue.data?.pending ?? []}
        validated={queue.data?.validated ?? []}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        loading={queue.isLoading}
        roster={roster}
        busy={validate.isPending || unvalidate.isPending}
        onValidate={async (classes) => {
          // Web (PresencesPage) toasts on both outcomes. Without this a
          // rejected write escaped onPress as an unhandled rejection and the
          // coach saw nothing — with bulk validation that could silently
          // swallow a whole week.
          try {
            await validate.mutateAsync(classes);
            toast.success(
              t("presences.toast.validated", { count: classes.length }),
            );
          } catch (err) {
            toast.error(t("presences.error.validateBody"));
            throw err; // the sheet catches this to keep the coach's edits open
          }
        }}
        onUnvalidate={async (id) => {
          try {
            await unvalidate.mutateAsync(id);
          } catch (err) {
            toast.error(t("presences.error.undoBody"));
            throw err;
          }
        }}
      />
    </ScrollView>
  );
}

function StatTile({
  icon,
  label,
  value,
  loading,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: number | string;
  loading?: boolean;
  testID: string;
}) {
  return (
    <View className="min-w-[45%] flex-1 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
        <Ionicons name={icon} size={18} color={lightTheme.primary} />
      </View>
      <View className="flex-1">
        {loading ? (
          <Skeleton className="mb-1 h-5 w-10" />
        ) : (
          // accessibilityValue, not just the label — a value-bearing view needs
          // the number exposed for a11y and for Maestro assertions.
          <Text
            testID={testID}
            accessibilityValue={{ text: String(value ?? 0) }}
            className="text-lg font-sans-bold"
          >
            {value ?? 0}
          </Text>
        )}
        <Text className="text-[11px] text-muted-foreground" numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * PAD-166 — one of web's toolbar controls, shrunk to a third of a phone's
 * width. Icon plus label, because three unlabelled glyphs in a row is a guess.
 */
function ToolbarButton({
  icon,
  label,
  badge,
  disabled,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  badge?: number;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2.5",
        disabled && "opacity-50"
      )}
    >
      <Ionicons name={icon} size={16} color={lightTheme.primary} />
      <Text className="text-xs" numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <View className="h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-[10px] text-primary-foreground">{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function PlayerRow({
  player,
  columns,
  onPress,
}: {
  player: PresencePlayerStats;
  /** The chosen columns; the row renders the numeric ones it was given. */
  columns: PresenceColumnKey[];
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const showTotal = columns.includes("total");
  // `total` leads in the avatar circle rather than repeating as a chip, and
  // `name` is the row's own title. Everything else the coach ticked becomes a
  // chip, in `PRESENCE_COLUMNS` order — the same order the CSV uses.
  const chips = visibleColumns(columns)
    .filter((column) => column.key !== "name" && column.key !== "total")
    .map((column) => ({
      key: column.key,
      value: player[column.key] as number,
      tone: column.key === "unjustified" ? ("bad" as const) : undefined,
    }));

  return (
    <Pressable
      testID="presences-player-row"
      accessibilityRole="button"
      accessibilityLabel={player.name}
      accessibilityValue={{ text: String(player.total) }}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3"
    >
      {showTotal ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Text className="text-sm font-sans-bold">{player.total}</Text>
        </View>
      ) : null}
      <View className="flex-1">
        <Text className="text-sm font-sans-bold" numberOfLines={1}>
          {player.name}
        </Text>
        <View className="mt-1 flex-row flex-wrap gap-x-3 gap-y-0.5">
          {chips
            .filter((c) => c.value > 0)
            .map((c) => (
              <Text
                key={c.key}
                className={cn(
                  "text-[11px]",
                  c.tone === "bad" ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {t(`presences.column.${c.key}`)}: {c.value}
              </Text>
            ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={lightTheme.mutedForeground} />
    </Pressable>
  );
}
