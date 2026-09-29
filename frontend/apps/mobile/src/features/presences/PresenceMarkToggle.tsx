import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { presenceMarkTone, type PresenceMark } from "@levelup/config";

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
    <View
      className="flex-row gap-1.5"
      accessibilityRole="radiogroup"
      // Same label web puts on its radiogroup (PAD-185). The long
      // `presences.mark.*` variants web uses in its detail view stay off iOS on
      // purpose: "Absent – unjustified" three-across does not fit 390pt, and the
      // group label already says whose row this is.
      accessibilityLabel={t("presences.validate.statusFor", { name: playerName })}
    >
      {OPTIONS.map((option) => {
        const active = value === option;
        const tone = active ? presenceMarkTone(option) : "neutral";
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
              // Semantic colour, not the brand accent: these encode an outcome (PAD-441,
              // attendance.validation rule 26). The non-colour cue is the bold label below, with
              // `accessibilityState.selected`; the border only takes the colour.
              tone === "neutral" && "border-border bg-background",
              tone === "positive" && "border-success bg-success/15",
              tone === "warning" && "border-warning bg-warning/15",
              tone === "negative" && "border-destructive bg-destructive/10",
              disabled && "opacity-50"
            )}
          >
            <Text
              className={cn(
                "text-xs",
                tone === "neutral" && "text-muted-foreground",
                // The `*-strong` shades exist because the solid colour is unreadable on
                // its own tint.
                tone === "positive" && "font-sans-bold text-success-strong",
                tone === "warning" && "font-sans-bold text-warning-strong",
                tone === "negative" && "font-sans-bold text-destructive"
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
