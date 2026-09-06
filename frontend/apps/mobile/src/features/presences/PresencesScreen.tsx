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
import { cn } from "@/lib/utils";
import { ValidateClassesSheet } from "./ValidateClassesSheet";
import {
  useCoachRoster,
  usePendingValidation,
  usePresenceStats,
  useUnvalidateClass,
  useValidateClasses,
  weekBounds,
} from "./hooks";

/**
 * PAD-140 — "Presenças" on iOS. Coach-only.
 *
 * Feature parity with the web tab, adapted to a phone:
 *   * same validation inbox (see `ValidateClassesSheet`)
 *   * same four KPI figures
 *   * the players *table* becomes a searchable list — eight numeric columns do
 *     not fit 390pt, so each row leads with the total and shows the rest as
 *     labelled chips
 *   * the trend line chart is dropped in favour of the figures it summarises;
 *     a 300pt-wide 90-day sparkline communicates less than the totals already
 *     shown, and mobile has no Recharts. The per-player bar chart's ranking is
 *     preserved by sorting the list by total, which is what that chart said.
 *
 * Those are presentation choices; every number and every action a coach can
 * take on web, they can take here.
 */
export function PresencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const week = React.useMemo(() => weekBounds(weekOffset), [weekOffset]);
  const stats = usePresenceStats();
  const queue = usePendingValidation(week);
  const roster = useCoachRoster();
  const validate = useValidateClasses();
  const unvalidate = useUnvalidateClass();

  const totals = stats.data?.totals;
  const players = stats.data?.players ?? [];

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? players.filter((p) => p.name.toLowerCase().includes(needle))
      : players;
  }, [players, query]);

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

      <View className="gap-2">
        <Text className="text-base font-sans-bold">{t("presences.table.title")}</Text>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t("presences.table.search")}
          testID="presences-search"
        />
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
              onPress={() => router.push(`/player/${player.playerId}`)}
            />
          ))
        )}
      </View>

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
          await validate.mutateAsync(classes);
        }}
        onUnvalidate={async (id) => {
          await unvalidate.mutateAsync(id);
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

function PlayerRow({
  player,
  onPress,
}: {
  player: PresencePlayerStats;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const chips: Array<{ key: string; value: number; tone?: "bad" }> = [
    { key: "private", value: player.private },
    { key: "academy", value: player.academy },
    { key: "unjustified", value: player.unjustified, tone: "bad" },
    { key: "invitesJoined", value: player.invitesJoined },
  ];

  return (
    <Pressable
      testID="presences-player-row"
      accessibilityRole="button"
      accessibilityLabel={player.name}
      accessibilityValue={{ text: String(player.total) }}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Text className="text-sm font-sans-bold">{player.total}</Text>
      </View>
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
