import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { Portal } from "@rn-primitives/portal";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Mirrors web's MessageActionMenu.tsx quickReactions.
const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

const MENU_WIDTH = 220;
const EDGE_MARGIN = 12;

export type ContextMenuAnchor = { x: number; y: number };

type Props = {
  /** Screen-space point the long press fired at (absoluteX/absoluteY). */
  anchor: ContextMenuAnchor;
  /** Own messages get Edit/Delete; others only get quick reactions. */
  isMine: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReaction: (emoji: string) => void;
};

/**
 * Floating menu anchored near the pressed bubble: a quick-reactions row on
 * top and Edit/Delete below (own messages only). Mirrors web's
 * MessageActionMenu.tsx, hand-rolled since no @rn-primitives popover/context
 * -menu primitive is installed — reuses the same Portal + backdrop pattern
 * already used by alert-dialog.tsx / dialog.tsx / select.tsx.
 */
export function MessageContextMenu({
  anchor,
  isMine,
  onClose,
  onEdit,
  onDelete,
  onReaction,
}: Props) {
  const { t } = useTranslation();
  const { width: vw, height: vh } = Dimensions.get("window");

  const actions = [
    ...(onEdit
      ? [
          {
            key: "edit",
            testID: "message-edit",
            label: t("common.edit"),
            icon: "pencil-outline" as const,
            destructive: false,
            onPress: onEdit,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            key: "delete",
            testID: "message-delete",
            label: t("common.delete"),
            icon: "trash-outline" as const,
            destructive: true,
            onPress: onDelete,
          },
        ]
      : []),
  ];

  // Rough menu height estimate (reactions row + action rows) to decide
  // whether it opens above or below the press point, clamped to the screen.
  const estimatedHeight = 52 + actions.length * 44;
  const showAbove = anchor.y + estimatedHeight + EDGE_MARGIN > vh;
  const top = showAbove
    ? Math.max(EDGE_MARGIN, anchor.y - estimatedHeight - 12)
    : Math.min(anchor.y + 16, vh - estimatedHeight - EDGE_MARGIN);
  let left = anchor.x - MENU_WIDTH / 2;
  left = Math.max(EDGE_MARGIN, Math.min(left, vw - MENU_WIDTH - EDGE_MARGIN));

  return (
    <Portal name="message-context-menu">
      {/* Backdrop and menu are SIBLINGS, not parent/child: nesting the menu
          inside the backdrop Pressable collapses everything into a single
          iOS accessibility node, making the inner buttons unreachable to
          VoiceOver and Maestro (same gotcha as exercise-group-folder). */}
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
          testID="message-context-menu"
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        >
            <View className="flex-row items-center justify-around border-b border-border px-2 py-2.5">
              {QUICK_REACTIONS.map((emoji, index) => (
                <Pressable
                  key={emoji}
                  testID={`reaction-${index}`}
                  accessibilityLabel={`React with ${emoji}`}
                  role="button"
                  onPress={() => onReaction(emoji)}
                  className="p-1 active:opacity-60"
                >
                  <Text className="text-2xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {actions.length > 0 ? (
              <View>
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
                        action.destructive
                          ? "text-destructive"
                          : "text-foreground"
                      )}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
        </View>
      </Animated.View>
    </Portal>
  );
}
