import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { Portal } from "@rn-primitives/portal";
import { useAndroidBack } from "@/lib/android-back";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 220;
const EDGE_MARGIN = 12;

type Props = {
  isBlocked: boolean;
  onClose: () => void;
  onToggleBlock: () => void;
  onReport: () => void;
};

/**
 * Floating menu for the conversation header's "more options" button.
 * Mirrors MessageContextMenu's Portal + backdrop + rounded-card structure
 * (same gotcha: backdrop and menu are SIBLINGS, not parent/child, or the
 * inner buttons become unreachable to VoiceOver/Maestro), but anchors to a
 * fixed top-right point under the header instead of a long-press point.
 */
export function ChatMoreOptionsMenu({
  isBlocked,
  onClose,
  onToggleBlock,
  onReport,
}: Props) {
  // Android back closes the menu (mobile.android-runtime rule 3); it is mounted only while open.
  useAndroidBack(true, onClose);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: vw } = Dimensions.get("window");

  const top = insets.top + 48;
  const left = Math.max(EDGE_MARGIN, vw - MENU_WIDTH - EDGE_MARGIN);

  const actions = [
    {
      key: "block",
      testID: isBlocked ? "chat-unblock-user" : "chat-block-user",
      label: isBlocked ? t("messages.unblockUser") : t("messages.blockUser"),
      icon: "ban-outline" as const,
      destructive: !isBlocked,
      onPress: onToggleBlock,
    },
    {
      key: "report",
      testID: "chat-report",
      label: t("messages.report.action"),
      icon: "flag-outline" as const,
      destructive: false,
      onPress: onReport,
    },
  ];

  return (
    <Portal name="chat-more-options-menu">
      <Pressable
        accessibilityLabel={t("messages.cancel")}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
        className="z-50 bg-black/10"
      />
      <Animated.View
        entering={FadeIn.duration(120)}
        exiting={FadeOut.duration(120)}
        style={{ position: "absolute", top, left, width: MENU_WIDTH, zIndex: 51 }}
      >
        <View
          testID="chat-more-options-menu"
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        >
          {actions.map((action, index) => (
            <Pressable
              key={action.key}
              testID={action.testID}
              accessibilityLabel={action.label}
              role="button"
              onPress={action.onPress}
              className={cn(
                "flex-row items-center gap-3 px-4 py-3 active:bg-accent",
                index < actions.length - 1 && "border-b border-border/50"
              )}
            >
              <Ionicons
                name={action.icon}
                size={16}
                color={
                  action.destructive
                    ? lightTheme.destructive
                    : lightTheme.foreground
                }
              />
              <Text
                className={cn(
                  "text-sm",
                  action.destructive ? "text-destructive" : "text-foreground"
                )}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Portal>
  );
}
