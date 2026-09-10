import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * The Semana nav row — calendar.mobile-views rule 11. React Native port of
 * apps/web's `WeekNav`: the `Hoje` pill, then the locale week range between
 * chevrons. Same testIDs as the Dia strip's chevrons, so the shared Maestro
 * `goto-seeded-monday` subflow works in either mode.
 */
export function WeekNav({
  weekLabel,
  onToday,
  onPrev,
  onNext,
}: {
  weekLabel: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2.5 border-b border-border bg-card px-4 py-3">
      <Pressable
        testID="calendar-today"
        role="button"
        accessibilityLabel={t("calendar.toolbar.today")}
        onPress={onToday}
        className="h-[34px] justify-center rounded-full border border-border bg-card px-3.5 active:bg-muted"
      >
        <Text className="text-[13px] font-sans-semibold text-foreground">
          {t("calendar.toolbar.today")}
        </Text>
      </Pressable>
      <View className="flex-1 flex-row items-center justify-center gap-4">
        <Pressable
          testID="calendar-prev-week"
          role="button"
          accessibilityLabel={t("calendar.toolbar.previousWeek")}
          onPress={onPrev}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
        >
          <Ionicons name="chevron-back" size={20} color={lightTheme.mutedForeground} />
        </Pressable>
        <Text
          accessibilityRole="header"
          testID="calendar-week-label"
          className="text-sm font-sans-semibold text-foreground"
        >
          {weekLabel}
        </Text>
        <Pressable
          testID="calendar-next-week"
          role="button"
          accessibilityLabel={t("calendar.toolbar.nextWeek")}
          onPress={onNext}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
        >
          <Ionicons name="chevron-forward" size={20} color={lightTheme.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
