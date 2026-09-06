import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { AbsenceSession, AttendanceSession } from "@levelup/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { absenceBadge } from "@/features/attendance/absence-badge";
import { AttendanceChart } from "@/features/attendance/AttendanceChart";
import { AttendanceHistoryList } from "@/features/attendance/AttendanceHistoryList";
import { AttendanceRangeControls } from "@/features/attendance/AttendanceRangeControls";
import {
  presetRange,
  type AttendanceRange,
  type AttendanceRangePreset,
} from "@/features/attendance/date-ranges";
import { useAbsenceHistory } from "@/features/attendance/hooks";

/**
 * PAD-163 — "Faltas" on iOS, the port of web's `AbsencesPage` (PAD-141, spec
 * `attendance.absences`).
 *
 * A thin page over the SAME chart / range-control / list primitives PAD-162's
 * attendance screen introduced, exactly as web's `AbsencesPage` reuses its own
 * `AttendanceChart` / `AttendanceRangeControls` / `AttendanceHistoryList`
 * rather than forking them: the two screens differ only in their data source,
 * their copy and the list's test ids, so this file never touches the chart or
 * range-control components — it only parametrizes the list (title, empty
 * copy, icon, justification badge) the way `AttendanceHistoryList` already
 * anticipates.
 *
 * One screen, two entry points, mirroring `attendance.tsx`:
 *   * `/absences`                 — the signed-in student's own absences,
 *                                   reached from the dashboard "Missed" KPI
 *   * `/absences?playerId=<id>`   — a coach viewing one roster player,
 *                                   reached from that player's detail screen
 *
 * The `playerId` here is NOT authorization. `GET /absence_history` re-checks
 * the caller server-side with the same resolver as `attendance_history` and
 * 403s otherwise — this screen is only UX (spec `attendance.absences`, note
 * on `AbsencesPage.tsx:32`).
 */
export default function AbsencesScreen() {
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
  } = useAbsenceHistory(range, playerId);

  const isCoachView = Boolean(playerId);

  const renderJustification = (session: AttendanceSession) => {
    const badge = absenceBadge((session as AbsenceSession).justification);
    if (!badge) return null;
    return (
      <Badge
        testID={`absences-justification-${badge.justification}`}
        variant={badge.variant}
      >
        <Text>{t(badge.labelKey)}</Text>
      </Badge>
    );
  };

  const header = (
    <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
      <Button
        variant="ghost"
        size="icon"
        testID="absences-back"
        accessibilityLabel={
          isCoachView
            ? t("absences.backToPlayer")
            : t("absences.backToDashboard")
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
        {t("absences.title")}
      </Text>
    </View>
  );

  return (
    <Screen edges={["top"]} testID="absences">
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        <Text
          testID="absences-subject"
          className="text-sm text-muted-foreground"
        >
          {isCoachView
            ? t("absences.subtitleOther", {
                name: history?.playerName ?? "",
              })
            : t("absences.subtitleOwn")}
        </Text>

        <Card>
          <CardContent className="gap-4 pt-6">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="flex-1 text-base font-semibold">
                {t("absences.chart.title")}
              </Text>
              <Text
                testID="absences-total"
                className="text-sm text-muted-foreground"
              >
                {t("absences.total", { count: history?.total ?? 0 })}
              </Text>
            </View>
            <AttendanceChart
              buckets={history?.buckets ?? []}
              granularity={history?.granularity ?? "day"}
              loading={isPending}
              error={isError}
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

        {isError ? (
          <ErrorState className="flex-none py-8" onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <AttendanceHistoryList
            sessions={history?.sessions ?? []}
            testIDPrefix="absences"
            titleKey="absences.history.title"
            emptyKey="absences.history.empty"
            iconName="close-circle-outline"
            renderBadge={renderJustification}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
