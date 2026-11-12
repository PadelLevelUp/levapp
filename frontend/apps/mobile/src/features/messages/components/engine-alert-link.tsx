import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { engineAlertClassRoute, type EngineAlertClassRoute } from "../engine-message";

/**
 * PAD-920 (dashboard.blocks NA3): the coach alert reaches the coach's Assistant thread as an
 * `engine_alert` text message; under its text, a link opens that class's native screen. Nothing
 * renders when the metadata names no class. The screen does the navigation (`onOpenClass`), so the
 * bubble stays free of the router.
 */
export function EngineAlertLink({
  messageId,
  metadata,
  onOpenClass,
}: {
  messageId: string | number;
  metadata: Record<string, unknown> | null | undefined;
  onOpenClass?: (route: EngineAlertClassRoute) => void;
}) {
  const { t } = useTranslation();
  const route = engineAlertClassRoute(metadata);
  if (!route || !onOpenClass) return null;
  return (
    <Pressable
      testID={`engine-alert-open-class-${messageId}`}
      accessibilityLabel={t("messages.engineAlert.openClass")}
      role="link"
      hitSlop={8}
      onPress={() => onOpenClass(route)}
      className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-primary/10 px-3 py-1.5"
    >
      <Ionicons name="calendar-outline" size={14} color={lightTheme.primary} />
      <Text className="text-xs font-medium text-primary">{t("messages.engineAlert.openClass")}</Text>
      <Ionicons name="chevron-forward" size={14} color={lightTheme.primary} />
    </Pressable>
  );
}
