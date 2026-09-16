import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * The Mês nav row — calendar.mobile-views rule 15. React Native port of
 * apps/web's `MonthNav`: `‹ Setembro 2026 ›` in the active language.
 */
export function MonthNav({
  monthLabel,
  onPrev,
  onNext,
}: {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-center gap-4 border-b border-border bg-card px-4 py-3">
      <Pressable
        testID="calendar-month-prev"
        role="button"
        accessibilityLabel={t("calendar.month.previous")}
        onPress={onPrev}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
      >
        <Ionicons name="chevron-back" size={20} color={lightTheme.mutedForeground} />
      </Pressable>
      <Text
        accessibilityRole="header"
        testID="calendar-month-label"
        className="min-w-[144px] text-center text-sm font-sans-semibold text-foreground"
      >
        {monthLabel}
      </Text>
      <Pressable
        testID="calendar-month-next"
        role="button"
        accessibilityLabel={t("calendar.month.next")}
        onPress={onNext}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
      >
        <Ionicons name="chevron-forward" size={20} color={lightTheme.mutedForeground} />
      </Pressable>
    </View>
  );
}
