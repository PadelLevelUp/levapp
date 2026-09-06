import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AttendanceChart } from "@/features/attendance/AttendanceChart";
import { AttendanceHistoryList } from "@/features/attendance/AttendanceHistoryList";
import { AttendanceRangeControls } from "@/features/attendance/AttendanceRangeControls";
import {
  presetRange,
  type AttendanceRange,
  type AttendanceRangePreset,
} from "@/features/attendance/date-ranges";
import { useAttendanceHistory } from "@/features/attendance/hooks";

/**
 * PAD-162 — "Presenças" on iOS, the port of web's `AttendancePage` (PAD-114,
 * spec `attendance.history` rule 9).
 *
 * One screen, two entry points, exactly as on web:
 *   * `/attendance`                 — the signed-in student's own history,
 *                                     reached from the dashboard "Attended" KPI
 *   * `/attendance?playerId=<id>`   — a coach viewing one roster player,
 *                                     reached from that player's detail screen
 *
 * Web spells the second as its own path (`/players/:playerId/attendance`); Expo
 * Router gets a query param instead, so a single file backs both rather than a
 * second screen duplicating the whole body.
 *
 * The `playerId` here is NOT authorization. `GET /attendance_history`
 * re-checks the caller server-side (self, or a coach with an
 * `Association_CoachPlayer` row) and 403s otherwise — this screen is only UX.
 * PAD-88 / PAD-115 are the precedent for not conflating the two.
 */
export default function AttendanceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId?: string }>();

  const [preset, setPreset] = React.useState<AttendanceRangePreset>("1m");
  const [customRange, setCustomRange] = React.useState<AttendanceRange | null>(
    null
  );

  const range = React.useMemo(
    () => customRange ?? presetRange(preset),
    [customRange, preset]
  );

  const {
    data: history,
    isPending,
    isError,
    refetch,
  } = useAttendanceHistory(range, playerId);

  const isCoachView = Boolean(playerId);

  const header = (
    <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
      <Button
        variant="ghost"
        size="icon"
        testID="attendance-back"
        accessibilityLabel={
          isCoachView
            ? t("attendance.backToPlayer")
            : t("attendance.backToDashboard")
        }
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
      </Button>
      <Text
        role="heading"
        aria-level={1}
        className="flex-1 text-xl font-bold"
        numberOfLines={1}
      >
        {t("attendance.title")}
      </Text>
    </View>
  );

  return (
    <Screen edges={["top"]} testID="attendance">
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        <Text
          testID="attendance-subject"
          className="text-sm text-muted-foreground"
        >
          {isCoachView
            ? t("attendance.subtitleOther", {
                name: history?.playerName ?? "",
              })
            : t("attendance.subtitleOwn")}
        </Text>

        <Card>
          <CardContent className="gap-4 pt-6">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="flex-1 text-base font-semibold">
                {t("attendance.chart.title")}
              </Text>
              <Text
                testID="attendance-total"
                className="text-sm text-muted-foreground"
              >
                {t("attendance.total", { count: history?.total ?? 0 })}
              </Text>
            </View>
            <AttendanceChart
              buckets={history?.buckets ?? []}
              granularity={history?.granularity ?? "day"}
              loading={isPending}
              error={isError}
            />
            {/* Chart on top, range controls directly below it (spec rule 10). */}
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

        {/* The chart above already carries the failure message, so this is the
            retry affordance rather than a second copy of the same sentence. */}
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <AttendanceHistoryList sessions={history?.sessions ?? []} />
        )}
      </ScrollView>
    </Screen>
  );
}
