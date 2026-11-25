import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { removeMessageToken, setMessageText, type CancelReasonState } from "@levelup/hooks";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * Ports web's CancelMessageEditor (classes.delete rule 13, PAD-840 phase 2): the cancellation message the coach
 * may edit for this one cancellation. Placeholders are chips removed whole; the text between them is theirs.
 */
export function CancelMessageEditor({ state }: { state: CancelReasonState }) {
  const { t } = useTranslation();
  const parts = state.messageParts;
  if (!parts) return null;
  return (
    <View className="gap-1.5" testID="cancel-message-editor">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs text-muted-foreground">{t("calendar.cancelReason.edit")}</Text>
        <Button
          variant="ghost"
          size="sm"
          testID="cancel-message-restore"
          disabled={!state.messageEdited}
          onPress={state.restoreMessage}
        >
          <Text>{t("calendar.cancelReason.restore")}</Text>
        </Button>
      </View>
      <View className="flex-row flex-wrap items-center gap-1 rounded-md border border-border bg-background p-2">
        {parts.map((part, i) =>
          part.kind === "token" ? (
            <View
              key={i}
              testID={`cancel-message-token-${part.name}`}
              className="flex-row items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5"
            >
              <Text className="text-xs text-primary">{`{${part.name}}`}</Text>
              <Pressable
                testID={`cancel-message-token-remove-${part.name}`}
                accessibilityRole="button"
                accessibilityLabel={t("calendar.cancelReason.removeToken", { name: part.name })}
                hitSlop={8}
                onPress={() => state.editMessage(removeMessageToken(parts, i))}
              >
                <Text className="text-xs text-primary">×</Text>
              </Pressable>
            </View>
          ) : (
            <TextInput
              key={i}
              testID={`cancel-message-text-${i}`}
              value={part.text}
              multiline
              onChangeText={(text) => state.editMessage(setMessageText(parts, i, text))}
              style={{ minWidth: 12, maxWidth: "100%", padding: 2, fontSize: 14 }}
              className="text-foreground"
            />
          ),
        )}
      </View>
    </View>
  );
}
