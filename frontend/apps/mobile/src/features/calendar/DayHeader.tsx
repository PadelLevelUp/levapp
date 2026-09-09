import { format } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";

/**
 * The selected day, spelled out — calendar.mobile-views rule 3. React Native
 * port of apps/web's `DayHeader`: navy circle with the day number, the full
 * weekday and date in the active language, and how many things are on.
 */
export function DayHeader({ day, count }: { day: Date; count: number }) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <View className="flex-row items-center gap-3.5 px-5 pb-2 pt-5">
      <View
        accessibilityElementsHidden
        className="h-12 w-12 items-center justify-center rounded-full bg-sidebar"
      >
        <Text className="text-xl font-sans-bold text-sidebar-foreground">
          {format(day, "d")}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text
          accessibilityRole="header"
          className="font-display text-xl text-foreground"
          style={{ letterSpacing: -0.4 }}
        >
          {format(day, "EEEE, d MMMM", { locale })}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {t("calendar.mobile.classCount", { count })}
        </Text>
      </View>
    </View>
  );
}
