import type { CalendarViewMode } from "@levelup/hooks";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const MODES: CalendarViewMode[] = ["day", "week", "month"];

/**
 * `Dia | Semana | Mês` — calendar.mobile-views rule 1. React Native port of
 * apps/web's `ViewModeControl`: the active segment is the navy pill
 * (`sidebar` tokens), idle segments are text only, and a mode that has not
 * shipped yet (Semana → PAD-247, Mês → PAD-248) renders disabled so the
 * control's shape is final from the first ticket.
 */
export function ViewModeControl({
  value,
  onChange,
  enabled,
}: {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
  enabled: CalendarViewMode[];
}) {
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t("calendar.views.label")}
      className="flex-row gap-1 border-b border-border bg-card px-4 py-2.5"
    >
      {MODES.map((mode) => {
        const isEnabled = enabled.includes(mode);
        const isActive = value === mode;
        return (
          <Pressable
            key={mode}
            testID={`calendar-view-${mode}`}
            role="tab"
            accessibilityState={{ selected: isActive, disabled: !isEnabled }}
            accessibilityHint={!isEnabled ? t("calendar.views.comingSoon") : undefined}
            disabled={!isEnabled}
            onPress={() => onChange(mode)}
            className={cn(
              "h-[30px] flex-1 items-center justify-center rounded-lg",
              isActive && "bg-sidebar",
              !isEnabled && "opacity-50"
            )}
          >
            <Text
              className={cn(
                "text-xs font-sans-semibold",
                isActive ? "text-sidebar-foreground" : "text-muted-foreground"
              )}
            >
              {t(`calendar.views.${mode}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
