import { classWhenHeader } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * calendar.event-detail rule 28 (UI idea 6), iOS: reading a class starts with when it is.
 *
 * While the coach edits, the children are the boxes, as before. While reading (marking attendance and planning
 * are reading), it is one header block, `class-detail-when`: a date tile, the time range in the display face on one
 * line (24 when the block is under 320 wide, 26 otherwise; it shrinks to its line at larger text sizes), a facts line
 * (level, then club and court) of what exists, and then its children, which are the capacity line the screen already
 * has. The series' end is NOT here: the screen's one repeat line says it. No count is computed here.
 *
 * The labels the boxes showed stay as the accessible names of the values: read out, not drawn.
 */
export function ClassWhenHeader({
  editing,
  date,
  startTime,
  endTime,
  levelCode,
  clubName,
  courtName,
  children,
}: {
  editing: boolean;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  levelCode?: string | null;
  clubName?: string | null;
  courtName?: string | null;
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [narrow, setNarrow] = React.useState(false);
  if (editing) return <View className="gap-3">{children}</View>;

  const when = classWhenHeader({ date, startTime, endTime }, i18n.language);
  const place = [clubName, courtName].filter(Boolean).join(" · ");
  const hasFacts = !!levelCode || !!place;

  return (
    <View
      testID="class-detail-when"
      className="gap-3"
      onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 320)}
    >
      <View className="flex-row items-center gap-3">
        <View
          testID="class-detail-date-tile"
          accessible
          accessibilityRole="image"
          accessibilityLabel={when.spokenDate}
          className="w-14 items-center rounded-lg border border-border bg-card py-1.5"
        >
          <Text className="text-[11px] font-sans-semibold uppercase text-muted-foreground">{when.weekday}</Text>
          <Text className="my-0.5 font-display text-3xl text-foreground">{when.day}</Text>
          <Text className="text-[11px] font-sans-semibold uppercase text-muted-foreground">{when.month}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text
            testID="class-detail-time"
            accessibilityLabel={t("calendar.detail.time")}
            accessibilityValue={{ text: when.timeRange }}
            numberOfLines={1}
            adjustsFontSizeToFit
            className="font-display text-foreground"
            style={{ fontSize: narrow ? 24 : 26 }}
          >
            {when.timeRange}
          </Text>
        </View>
      </View>

      {hasFacts ? (
        <Text testID="class-detail-facts" className="text-sm text-muted-foreground">
          {levelCode ? (
            <Text
              testID="class-detail-level"
              accessibilityLabel={t("calendar.detail.level")}
              accessibilityValue={{ text: levelCode }}
              className="font-sans-semibold text-foreground"
            >
              {levelCode}
            </Text>
          ) : null}
          {levelCode && place ? " · " : null}
          {place ? (
            <Text
              testID="class-detail-place"
              accessibilityLabel={t("calendar.detail.club")}
              accessibilityValue={{ text: place }}
            >
              {place}
            </Text>
          ) : null}
        </Text>
      ) : null}

      {children}
    </View>
  );
}
