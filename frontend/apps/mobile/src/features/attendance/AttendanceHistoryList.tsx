import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { AttendanceSession } from "@levelup/types";
import { format, parseISO } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { parseDashboardItemId } from "@/features/calendar/params";
import { useDateLocale } from "@/lib/date-locale";

/**
 * PAD-162 — the attended-class history, ported from web's
 * `components/attendance/AttendanceHistoryList.tsx` (PAD-114).
 *
 * Each row deep-links to the class (spec `attendance.history` rule 13). Web
 * follows the server-built `href`
 * (`/calendar?classId=lessoninstance-<id>&date=…`); that path does not exist in
 * the Expo Router tree, so the row resolves the same `calendarEventId` through
 * `parseDashboardItemId` and pushes `/class/[id]` — exactly what a dashboard
 * class row on this platform already does. One deep-link contract, two route
 * shapes.
 *
 * The parameters below all default to the attendance behaviour, mirroring web,
 * so PAD-163 can reuse this list for the "Faltas" screen with its own test ids
 * and its own justification badge without either screen's assertions passing
 * against the other.
 */
export function AttendanceHistoryList({
  sessions,
  testIDPrefix = "attendance",
  titleKey = "attendance.history.title",
  emptyKey = "attendance.history.empty",
  iconName = "calendar-outline",
  renderBadge,
}: {
  sessions: AttendanceSession[];
  testIDPrefix?: string;
  titleKey?: string;
  emptyKey?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Optional trailing label per row (PAD-163 uses it for justification). */
  renderBadge?: (session: AttendanceSession) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const openSession = (session: AttendanceSession) => {
    const parsed = parseDashboardItemId(session.calendarEventId);
    if (!parsed) return;
    router.push({
      pathname: "/class/[id]",
      params: {
        id: session.calendarEventId,
        model: parsed.model,
        originalId: String(parsed.originalId),
        date: parsed.date || session.date,
        title: session.title,
        color: session.color ?? "",
        isRecurring: parsed.date ? "1" : "0",
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(titleKey)}</CardTitle>
      </CardHeader>
      {/* The container is always present — an empty period is a state of the
          list, not the absence of one. */}
      <CardContent testID={`${testIDPrefix}-history-list`} className="gap-1">
        {sessions.length === 0 ? (
          <Text
            testID={`${testIDPrefix}-history-empty`}
            className="py-6 text-center text-sm text-muted-foreground"
          >
            {t(emptyKey)}
          </Text>
        ) : (
          sessions.map((session) => {
            // `date` and `startDatetime` are naive UTC. `parseISO` on a naive
            // string yields that same wall-clock time locally, so the class's
            // own clock time is what renders — re-reading them in the device's
            // timezone would slide an early or late class onto the neighbouring
            // day, which is the drift web pins its formatters to UTC to avoid.
            const dayLabel = format(
              parseISO(session.date),
              "EEEE, d MMMM yyyy",
              { locale }
            );
            const timeLabel = format(
              parseISO(session.startDatetime.slice(0, 19)),
              "HH:mm"
            );

            return (
              <Pressable
                key={session.lessonInstanceId}
                testID={`${testIDPrefix}-history-item`}
                role="button"
                accessibilityLabel={t("attendance.history.openClass", {
                  title: session.title,
                  date: dayLabel,
                })}
                onPress={() => openSession(session)}
                className="flex-row items-center gap-3 rounded-md px-2 py-3 active:bg-accent"
              >
                <View
                  className="h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: session.color
                      ? `${session.color}22`
                      : lightTheme.muted,
                  }}
                >
                  <Ionicons
                    name={iconName}
                    size={16}
                    color={session.color ?? lightTheme.mutedForeground}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium" numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {dayLabel} · {timeLabel}
                  </Text>
                </View>
                {renderBadge?.(session)}
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={lightTheme.mutedForeground}
                />
              </Pressable>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
