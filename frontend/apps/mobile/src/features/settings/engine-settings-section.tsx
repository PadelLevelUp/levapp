import { ENGINE_DEFAULT_MAX_AT_A_TIME } from "@levelup/config";
import type { EngineConfig, EngineTimingMethod } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { EngineStepper } from "./engine-stepper";

/**
 * PAD-920 (notifications.config rule 20): the new engine's own settings, shown only to a coach on
 * `new`: M, the timing method and the pair, automatic entry and the students' side choice. Null values
 * are the engine's: M's default, and minutes that fall back to `maxInactiveTime` (rule 19); a step
 * makes the shown value the coach's own.
 */
const METHODS: EngineTimingMethod[] = ["fixed", "per_tier", "progressive"];

export function EngineSettingsSection({
  engine,
  pair,
  onChange,
  onMethodChange,
  disabled,
}: {
  engine: EngineConfig;
  /** The pair as the engine reads it: each null side already resolved to `maxInactiveTime`. */
  pair: { betweenRoundsMinutes: number; betweenGroupsMinutes: number };
  onChange: (engine: EngineConfig) => void;
  onMethodChange: (method: EngineTimingMethod) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const minutes = t("settings.restrictions.min");
  const row = (label: string, control: React.ReactNode, help?: string) => (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-sm font-medium">{label}</Text>
        {control}
      </View>
      {help ? <Text className="text-xs text-muted-foreground">{help}</Text> : null}
    </View>
  );

  return (
    <View testID="settings-engine-new" className="gap-4">
      {row(
        t("settings.engine.newEngine.maxAtATime"),
        <EngineStepper
          id="engine-max-at-a-time"
          boundKey="maxAtATime"
          value={engine.maxAtATime ?? ENGINE_DEFAULT_MAX_AT_A_TIME}
          disabled={disabled}
          onChange={(maxAtATime) => onChange({ ...engine, maxAtATime })}
        />
      )}

      <View className="gap-2">
        <Text className="text-sm font-medium">{t("settings.engine.newEngine.timingMethod")}</Text>
        <View className="gap-2">
          {METHODS.map((method) => {
            const selected = engine.timing.method === method;
            return (
              <Pressable
                key={method}
                testID={`engine-timing-method-${method}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: !!disabled }}
                disabled={disabled}
                onPress={() => {
                  if (!selected) onMethodChange(method);
                }}
                className={cn(
                  "rounded-md border px-3 py-2.5",
                  selected ? "border-primary bg-primary/10" : "border-input bg-background"
                )}
              >
                <Text className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>
                  {t(`settings.engine.newEngine.method.${method}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {row(
        t("settings.engine.newEngine.betweenRounds"),
        <EngineStepper
          id="engine-between-rounds"
          boundKey="betweenRoundsMinutes"
          value={pair.betweenRoundsMinutes}
          unit={minutes}
          disabled={disabled}
          onChange={(v) => onChange({ ...engine, timing: { ...engine.timing, betweenRoundsMinutes: v } })}
        />
      )}
      {row(
        t("settings.engine.newEngine.betweenGroups"),
        <EngineStepper
          id="engine-between-groups"
          boundKey="betweenGroupsMinutes"
          value={pair.betweenGroupsMinutes}
          unit={minutes}
          disabled={disabled}
          onChange={(v) => onChange({ ...engine, timing: { ...engine.timing, betweenGroupsMinutes: v } })}
        />
      )}

      {row(
        t("settings.engine.newEngine.autoEntry"),
        <Switch
          testID="engine-auto-entry"
          accessibilityLabel={t("settings.engine.newEngine.autoEntry")}
          checked={engine.autoEntryBeforeAttendanceRequest}
          disabled={disabled}
          onCheckedChange={(autoEntryBeforeAttendanceRequest: boolean) => onChange({ ...engine, autoEntryBeforeAttendanceRequest })}
        />
      )}
      {row(
        t("settings.engine.newEngine.sideChoice"),
        <Switch
          testID="engine-side-choice"
          accessibilityLabel={t("settings.engine.newEngine.sideChoice")}
          checked={engine.waitingListSideChoice}
          disabled={disabled}
          onCheckedChange={(waitingListSideChoice: boolean) => onChange({ ...engine, waitingListSideChoice })}
        />
      )}
    </View>
  );
}
