import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { PresenceMark } from "@levelup/config";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const OPTIONS: PresenceMark[] = ["present", "justified", "unjustified"];

/**
 * PAD-140 — the three-way present/justified/unjustified control.
 *
 * The iOS twin of the web `PresenceMarkToggle`. Both write the same
 * `status` + `justification` pair through the shared mapping in
 * `@levelup/config`, so the platforms differ only in how the choice is drawn.
 *
 * Each option is its own Pressable rather than a segmented control, because
 * `accessibilityState.selected` on three separate buttons is what Maestro can
 * actually assert against — and Pressables must never be nested here.
 */
export function PresenceMarkToggle({
  value,
  onChange,
  disabled,
  playerName,
}: {
  value: PresenceMark | null;
  onChange: (mark: PresenceMark) => void;
  disabled?: boolean;
  playerName: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            disabled={disabled}
            onPress={() => onChange(option)}
            testID={`presence-mark-${option}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            accessibilityLabel={`${t(`presences.mark.short.${option}`)} — ${playerName}`}
            className={cn(
              // flex-1: the three options split the row evenly now that the
              // name sits above them, so labels never clip.
              "flex-1 items-center rounded-md border px-2 py-1.5",
              !active && "border-border bg-background",
              // Semantic colour, not the brand accent: these encode an outcome.
              active && option === "present" && "border-success/40 bg-success/15",
              active && option === "justified" && "border-border bg-muted",
              active &&
                option === "unjustified" &&
                "border-destructive bg-destructive/10",
              disabled && "opacity-50"
            )}
          >
            <Text
              className={cn(
                "text-xs",
                !active && "text-muted-foreground",
                // `success-strong` exists because the solid success green is
                // unreadable on its own tint.
                active && option === "present" && "font-sans-bold text-success-strong",
                active && option === "justified" && "font-sans-bold text-foreground",
                active && option === "unjustified" && "font-sans-bold text-destructive"
              )}
            >
              {t(`presences.mark.short.${option}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
