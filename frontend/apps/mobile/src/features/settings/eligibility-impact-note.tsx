/**
 * PAD-150 — the stricter-bar report on iOS (eligibility.enforcement 9, 9a, 9b).
 * Port of web's EligibilityImpactNote: rendered from the save response only,
 * a headline with the number of affected students, one line per
 * (student, class), no action.
 */
import type { EligibilityImpactEntry } from "@levelup/types";
import { describeImpact, formatClubDateTime, impactStudentCount, resolveText } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function EligibilityImpactNote({ affected }: { affected: EligibilityImpactEntry[] | null }) {
  const { t } = useTranslation();
  const lines = React.useMemo(() => (affected ? describeImpact(affected) : []), [affected]);
  if (affected === null) return null;
  const count = impactStudentCount(affected);

  return (
    <View
      className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
      testID="eligibility-impact"
      accessibilityRole="text"
    >
      <Text className="text-xs font-sans-semibold">
        {count === 0
          ? t("settings.eligibility.impact.none")
          : t("settings.eligibility.impact.title", { count })}
      </Text>
      {count > 0 ? (
        <View className="mt-1 gap-1.5">
          <Text className="text-xs text-muted-foreground">{t("settings.eligibility.impact.body")}</Text>
          {lines.map((l) => (
            <Text key={`${l.playerId}-${l.instanceId}`} className="text-xs" testID="eligibility-impact-line">
              <Text className="text-xs font-sans-semibold">
                {t("settings.eligibility.impact.line", {
                  name: l.name,
                  class: l.classTitle,
                  when: formatClubDateTime(l.startDatetime),
                })}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {" — "}
                {l.reasons.map((r) => resolveText(t, r)).join("; ")}
              </Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
