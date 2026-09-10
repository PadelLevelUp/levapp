/**
 * PAD-129 — the class screen's eligibility tier on iOS (eligibility.cascade
 * rules 7–9). Port of web's ClassEligibilityBlock: the provenance badge in
 * view mode; in edit mode a three-way segmented choice — standard bar (clear
 * this tier), everyone (`[]`), custom (the settings editor) — built on
 * Pressable like the invitation-mode control, since no radio primitive is
 * installed.
 */
import type { GroupRule } from "@levelup/types";
import { lightTheme, tierMode, tierValueFor, type EligibilityTierMode } from "@levelup/config";
import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { EligibilitySection } from "@/features/settings/eligibility-section";

const MODES: EligibilityTierMode[] = ["standard", "everyone", "custom"];

type Tier = "instance" | "lesson" | "coach";
type VisibilityMode = "inherit" | "on" | "off";
const VISIBILITY_MODES: VisibilityMode[] = ["inherit", "on", "off"];

export function ClassEligibilityBlock({
  current,
  effective,
  source,
  editing,
  onChange,
  openSpots,
  effectiveOpenSpots,
  openSpotsSource,
  onOpenSpotsChange,
}: {
  current: GroupRule[] | null;
  effective: GroupRule[] | null;
  source: Tier;
  editing: boolean;
  onChange: (rules: GroupRule[] | null) => void;
  /** PAD-130: the open-spot toggle at this tier (`null` = inherit). */
  openSpots?: boolean | null;
  effectiveOpenSpots?: boolean;
  openSpotsSource?: Tier;
  onOpenSpotsChange?: (value: boolean | null) => void;
}) {
  const { t } = useTranslation();
  const mode = tierMode(current);
  const visibilityMode: VisibilityMode = openSpots == null ? "inherit" : openSpots ? "on" : "off";

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3" testID="class-eligibility">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Ionicons name="shield-checkmark-outline" size={16} color={lightTheme.mutedForeground} />
          <Text className="text-sm font-medium">{t("calendar.eligibility.title")}</Text>
        </View>
        <Badge variant="outline" testID="class-eligibility-source">
          <Text>{t(`calendar.eligibility.source.${source}`)}</Text>
        </Badge>
      </View>
      {editing ? (
        <View className="gap-2">
          <Text className="text-xs text-muted-foreground">{t("calendar.eligibility.hint")}</Text>
          <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
            {MODES.map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  testID={`class-eligibility-mode-${m}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onChange(tierValueFor(m, current, effective))}
                  className={cn(
                    "rounded-full px-3 py-1.5",
                    selected ? "bg-primary" : "bg-muted"
                  )}
                >
                  <Text className={cn("text-xs font-sans-semibold", selected ? "text-primary-foreground" : "text-muted-foreground")}>
                    {t(`calendar.eligibility.mode.${m}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode === "standard" ? (
            <Text className="text-xs text-muted-foreground">{t("calendar.eligibility.standardHint")}</Text>
          ) : null}
          {mode === "everyone" ? (
            <Text className="text-xs text-muted-foreground">{t("calendar.eligibility.everyoneHint")}</Text>
          ) : null}
          {mode === "custom" ? (
            <EligibilitySection
              rules={current ?? []}
              // An emptied custom list is "everyone" — [] on the wire, never null.
              onChange={(rules) => onChange(rules ?? [])}
            />
          ) : null}
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">
          {(effective?.length ?? 0) === 0
            ? t("calendar.eligibility.everyoneHint")
            : t("settings.eligibility.allRulesApply")}
        </Text>
      )}

      {/* PAD-130: the same cascade for "advertise this class's empty spots". */}
      {onOpenSpotsChange ? (
        <View className="gap-2 border-t border-border pt-2" testID="class-open-spots">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-medium">{t("calendar.openSpot.title")}</Text>
            <Badge variant="outline" testID="class-open-spots-source">
              <Text>
                {t(`calendar.openSpot.source.${openSpotsSource ?? "coach"}`)} ·{" "}
                {t(effectiveOpenSpots ? "calendar.openSpot.mode.on" : "calendar.openSpot.mode.off")}
              </Text>
            </Badge>
          </View>
          {editing ? (
            <View className="gap-2">
              <Text className="text-xs text-muted-foreground">{t("calendar.openSpot.hint")}</Text>
              <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
                {VISIBILITY_MODES.map((m) => {
                  const selected = visibilityMode === m;
                  return (
                    <Pressable
                      key={m}
                      testID={`class-open-spots-mode-${m}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => onOpenSpotsChange(m === "inherit" ? null : m === "on")}
                      className={cn("rounded-full px-3 py-1.5", selected ? "bg-primary" : "bg-muted")}
                    >
                      <Text className={cn("text-xs font-sans-semibold", selected ? "text-primary-foreground" : "text-muted-foreground")}>
                        {t(`calendar.openSpot.mode.${m}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
