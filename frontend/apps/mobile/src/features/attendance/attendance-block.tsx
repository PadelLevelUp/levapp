/**
 * players.profile rule 12 (PAD-834): Block 3, Assiduidade, on the player screen — the web twin is
 * `PlayerAttendanceBlock.tsx`, with the same ids. Presenças above Faltas (stacked on a phone),
 * under one row of period chips that applies to both. Each card: the server's total and bucket
 * chart, and a toggle that lists the period's sessions inside the card; an open list ends with
 * "Ver página completa", where the custom range lives (decision D6). A card whose total is 0
 * says so and its toggle is disabled. No rate (D5).
 */
import { seasonsApi } from "@levelup/api";
import { useQuery } from "@tanstack/react-query";
import type { AbsenceSession, AttendanceHistory, AttendanceSession } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import { absenceBadge } from "./absence-badge";
import { AttendanceChart } from "./AttendanceChart";
import { AttendanceHistoryList } from "./AttendanceHistoryList";
import { presetRange, type AttendanceRangePreset } from "./date-ranges";
import { useAbsenceHistory, useAttendanceHistory } from "./hooks";

/** const:PROFILE_PERIOD_PRESETS / PROFILE_PERIOD_DEFAULT. */
const PERIODS: Array<{ key: AttendanceRangePreset; labelKey: string; ariaKey: string }> = [
  { key: "1w", labelKey: "attendance.ranges.week", ariaKey: "attendance.ranges.weekAria" },
  { key: "1m", labelKey: "attendance.ranges.month", ariaKey: "attendance.ranges.monthAria" },
  { key: "1y", labelKey: "attendance.ranges.year", ariaKey: "attendance.ranges.yearAria" },
  { key: "season", labelKey: "attendance.ranges.season", ariaKey: "attendance.ranges.seasonAria" },
];
const DEFAULT_PERIOD: AttendanceRangePreset = "1m";

type Kind = "attendance" | "absences";

export function AttendanceBlock({
  playerId,
  onOpenFull,
  now,
}: {
  playerId: string;
  /** "Ver página completa": the full presences or absences screen for this player. */
  onOpenFull: (kind: Kind) => void;
  now?: Date;
}) {
  const { t } = useTranslation();
  const [period, setPeriod] = React.useState<AttendanceRangePreset>(DEFAULT_PERIOD);
  const [open, setOpen] = React.useState<Record<Kind, boolean>>({ attendance: false, absences: false });
  React.useEffect(() => {
    setOpen({ attendance: false, absences: false });
    setPeriod(DEFAULT_PERIOD);
  }, [playerId]);

  // calendar.seasons rule 14: "Época" only when the coach's season has a current occurrence.
  const { data: seasonDefinition } = useQuery({ queryKey: ["season"], queryFn: seasonsApi.getSeason });
  const season = seasonDefinition?.current ?? null;
  const range = React.useMemo(() => presetRange(period, now, season), [period, now, season]);
  const attendance = useAttendanceHistory(range, playerId);
  const absences = useAbsenceHistory(range, playerId);
  const periods = PERIODS.filter((p) => p.key !== "season" || season !== null);

  const renderJustification = (session: AttendanceSession) => {
    const badge = absenceBadge((session as AbsenceSession).justification);
    if (!badge) return null;
    return (
      <Badge testID={`absences-justification-${badge.justification}`} variant={badge.variant}>
        <Text>{t(badge.labelKey)}</Text>
      </Badge>
    );
  };

  const card = (kind: Kind, q: { data?: AttendanceHistory; isPending: boolean; isError: boolean }) => {
    const isAttendance = kind === "attendance";
    const prefix = isAttendance ? "profile-attendance" : "profile-absences";
    const total = q.data?.total ?? 0;
    const empty = !q.isPending && !q.isError && total === 0;
    const listOpen = open[kind] && !empty;
    return (
      <View className="gap-3 rounded-lg border border-border p-3" testID={`${prefix}-card`} accessibilityHint={q.data ? String(total) : ""}>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-sm font-semibold">{t(isAttendance ? "attendance.title" : "absences.title")}</Text>
          <Text className="text-sm text-muted-foreground" testID={`${prefix}-total`}>
            {t(isAttendance ? "attendance.total" : "absences.total", { count: total })}
          </Text>
        </View>
        {empty ? (
          <Text className="text-sm text-muted-foreground" testID={`${prefix}-empty`}>
            {t(isAttendance ? "attendance.history.empty" : "absences.history.empty")}
          </Text>
        ) : (
          <AttendanceChart
            buckets={q.data?.buckets ?? []}
            granularity={q.data?.granularity ?? "day"}
            loading={q.isPending}
            error={q.isError}
            {...(isAttendance ? {} : { copyNamespace: "absences.chart" as const })}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          testID={`${prefix}-toggle`}
          accessibilityLabel={listOpen ? t("players.card.hideList") : t(isAttendance ? "attendance.playerLink" : "absences.playerLink")}
          accessibilityState={{ expanded: listOpen, disabled: empty || q.isPending }}
          disabled={empty || q.isPending}
          onPress={() => setOpen((o) => ({ ...o, [kind]: !o[kind] }))}
        >
          <Text>{listOpen ? t("players.card.hideList") : t(isAttendance ? "attendance.playerLink" : "absences.playerLink")}</Text>
        </Button>
        {listOpen ? (
          <View className="gap-2" testID={`${prefix}-list`}>
            <AttendanceHistoryList
              sessions={q.data?.sessions ?? []}
              testIDPrefix={prefix}
              titleKey={isAttendance ? "attendance.history.title" : "absences.history.title"}
              emptyKey={isAttendance ? "attendance.history.empty" : "absences.history.empty"}
              {...(isAttendance ? {} : { iconName: "close-circle-outline" as const, renderBadge: renderJustification })}
            />
            <Button variant="link" size="sm" testID={`${prefix}-full`} accessibilityLabel={t("players.card.fullPage")}
              onPress={() => onOpenFull(kind)}>
              <Text>{t("players.card.fullPage")}</Text>
            </Button>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Card testID="profile-attendance-block">
      <CardHeader className="gap-2">
        <CardTitle>{t("players.card.attendanceTitle")}</CardTitle>
        <View className="flex-row flex-wrap gap-1" testID="profile-period" accessibilityLabel={t("players.card.periodAria")}>
          {periods.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? "default" : "outline"}
              testID={`profile-period-${p.key}`}
              accessibilityLabel={t(p.ariaKey)}
              accessibilityState={{ selected: period === p.key }}
              onPress={() => setPeriod(p.key)}
            >
              <Text>{t(p.labelKey)}</Text>
            </Button>
          ))}
        </View>
      </CardHeader>
      <CardContent className="gap-4">
        {card("attendance", attendance)}
        {card("absences", absences)}
      </CardContent>
    </Card>
  );
}
