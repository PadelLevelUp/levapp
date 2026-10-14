import {
  cardSurfaceNative,
  nativeCalendarSurfaces,
  STUDENT_FILTER_DEFAULT,
  studentLegendItems,
  type StudentCalendarFilter,
} from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { readStudentFilter, writeStudentFilter } from "./student-filter-store";

const SURFACES = nativeCalendarSurfaces("light");
const OPTIONS: StudentCalendarFilter[] = ["eligible", "mine"];

/**
 * PAD-664 (calendar.view rule 23, mobile-views rule 9): the student's filter, remembered per
 * student on this device, defaulting to every class they are eligible for.
 */
export function useStudentCalendarFilter(
  userId: string | number | null | undefined
): [StudentCalendarFilter, (next: StudentCalendarFilter) => void] {
  const [filter, setFilter] = React.useState<StudentCalendarFilter>(STUDENT_FILTER_DEFAULT);
  React.useEffect(() => {
    if (userId == null) return;
    let alive = true;
    readStudentFilter(userId).then((stored) => {
      if (alive) setFilter(stored);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const update = React.useCallback(
    (next: StudentCalendarFilter) => {
      setFilter(next);
      if (userId != null) void writeStudentFilter(userId, next);
    },
    [userId]
  );
  return [filter, update];
}

/** The two-option control plus ONE compact legend row listing what the filter leaves visible. */
export function StudentCalendarHeader({
  filter,
  onChange,
}: {
  filter: StudentCalendarFilter;
  onChange: (next: StudentCalendarFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2 px-5 pb-2 pt-1">
      <View
        testID="calendar-student-filter"
        accessibilityLabel={t("calendar.studentFilter.label")}
        className="flex-row rounded-lg bg-secondary p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = filter === option;
          return (
            <Pressable
              key={option}
              testID={`calendar-student-filter-${option}`}
              role="button"
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option)}
              className={cn(
                "flex-1 items-center rounded-md py-1.5 active:opacity-90",
                selected && "bg-card"
              )}
            >
              <Text className={cn("text-[13px]", selected ? "font-sans-bold" : "text-muted-foreground")}>
                {t(`calendar.studentFilter.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View testID="calendar-legend" className="flex-row flex-wrap gap-x-3 gap-y-1">
        {studentLegendItems(filter).map(({ variant, key }) => {
          const surface = cardSurfaceNative(undefined, variant, SURFACES, "student");
          return (
            <View
              key={variant}
              testID={`calendar-legend-item-${variant}`}
              className="flex-row items-center gap-1"
            >
              <View
                className="h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundColor: surface.backgroundColor,
                  borderWidth: surface.borderWidth,
                  borderStyle: surface.borderStyle,
                  borderColor: surface.borderColor,
                }}
              />
              <Text className="text-[11px] text-muted-foreground">{t(key)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
