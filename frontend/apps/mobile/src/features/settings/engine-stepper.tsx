import { Ionicons } from "@expo/vector-icons";
import { ENGINE_SETTING_BOUNDS, lightTheme, stepEngineSetting, type EngineSettingKey } from "@levelup/config";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * PAD-920 (notifications.config rule 20): a stepper over ENGINE_SETTING_BOUNDS, the bounds web reads,
 * so the minutes start at ENGINE_T_FLOOR (1 minute) as on web. Same shape as the restrictions' stepper.
 */
export function EngineStepper({
  id,
  boundKey,
  value,
  unit,
  disabled,
  onChange,
}: {
  id: string;
  boundKey: EngineSettingKey;
  value: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { min, max } = ENGINE_SETTING_BOUNDS[boundKey];
  const button = (direction: 1 | -1) => {
    const off = !!disabled || (direction > 0 ? value >= max : value <= min);
    return (
      <Pressable
        testID={`${id}-${direction > 0 ? "inc" : "dec"}`}
        accessibilityRole="button"
        accessibilityLabel={direction > 0 ? "+" : "−"}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => onChange(stepEngineSetting(boundKey, value, direction))}
        hitSlop={6}
        className={cn("h-8 w-8 items-center justify-center rounded-md border border-input bg-background", off && "opacity-40")}
      >
        <Ionicons name={direction > 0 ? "add" : "remove"} size={16} color={lightTheme.foreground} />
      </Pressable>
    );
  };
  return (
    <View className="flex-row items-center gap-1">
      {button(-1)}
      <Text testID={`${id}-value`} className="w-11 text-center text-sm font-semibold">
        {String(value)}
      </Text>
      {button(1)}
      {unit ? <Text className="ml-1 text-xs text-muted-foreground">{unit}</Text> : null}
    </View>
  );
}
