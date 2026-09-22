import { Ionicons } from "@expo/vector-icons";
import { lightTheme, type ClassEvaluationsActionState } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface ClassEvaluationsActionProps {
  /** `classEvaluationsAction(...)` — the server's answer, never a date compared on the device. */
  state: ClassEvaluationsActionState;
  onOpen: () => void;
  /** For the `error` state: the read failed for a reason other than "not the owner" — try again. */
  onRetry?: () => void;
}

/**
 * "Avaliações", the class detail's primary action on iOS (evaluations.class-panel
 * rules 1, 10) — the same four states as web's `ClassEvaluationsAction`.
 */
export function ClassEvaluationsAction({ state, onOpen, onRetry }: ClassEvaluationsActionProps) {
  const { t } = useTranslation();
  if (state === "hidden") return null;
  if (state === "error") {
    return (
      <View className="flex-row items-center justify-between gap-2 rounded-md border border-destructive/40 p-2" testID="class-eval-error">
        <Text className="shrink text-xs text-destructive" accessibilityRole="alert">{t("players.classEvaluations.loadError")}</Text>
        <Button variant="outline" size="sm" onPress={onRetry} testID="class-eval-retry">
          <Text>{t("players.evaluationHistory.retry")}</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-1.5">
      <Button onPress={onOpen} disabled={state !== "available"} testID="class-evaluations-open">
        <Ionicons name="star-outline" size={16} color={lightTheme.primaryForeground} />
        <Text>{t("players.classEvaluations.open")}</Text>
      </Button>
      {state === "unavailable" ? (
        <Text className="text-xs text-muted-foreground" testID="class-eval-unavailable">
          {t("players.classEvaluations.unavailable")}
        </Text>
      ) : null}
    </View>
  );
}
