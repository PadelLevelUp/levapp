import * as React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { CANCEL_REASON_MAX, type CancelReasonState } from "@levelup/hooks";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

import { CancelMessageEditor } from "./cancel-message-editor";

/**
 * Ports web's CancelReasonFields (classes.delete rule 12, PAD-840): the reason, whether the students are
 * told it, and the message they would get. Nobody enrolled: the dialog says so instead of the last two.
 */
export function CancelReasonFields({ state }: { state: CancelReasonState }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <View className="flex-row items-baseline justify-between">
          <Label>{t("calendar.cancelReason.label")}</Label>
          <Text className="text-xs text-muted-foreground" testID="cancel-reason-counter">
            {`${state.reason.length}/${CANCEL_REASON_MAX}`}
          </Text>
        </View>
        <Textarea
          testID="cancel-reason-input"
          accessibilityLabel={t("calendar.cancelReason.label")}
          value={state.reason}
          onChangeText={state.setReason}
          maxLength={CANCEL_REASON_MAX}
          placeholder={t("calendar.cancelReason.placeholder")}
          numberOfLines={2}
          className="min-h-[60px]"
        />
      </View>
      {state.nobody ? (
        <Text className="text-sm text-muted-foreground" testID="cancel-reason-nobody">
          {t("calendar.cancelReason.nobody")}
        </Text>
      ) : (
        <>
          <View className="flex-row items-center gap-2">
            <Checkbox
              testID="cancel-reason-send"
              accessibilityLabel={t("calendar.cancelReason.send")}
              checked={state.sendReason}
              disabled={!state.hasReason}
              onCheckedChange={state.setSend}
            />
            <Text className="flex-1 text-sm">{t("calendar.cancelReason.send")}</Text>
          </View>
          <CancelMessageEditor state={state} />
          {state.preview ? (
            <View className="gap-1 rounded-md border border-border bg-muted/30 p-3">
              <Text className="text-xs text-muted-foreground">
                {t(state.messageParts ? "calendar.cancelReason.renderedPreview" : "calendar.cancelReason.preview")}
              </Text>
              <Text className="text-sm" testID="cancel-reason-preview">
                {state.preview.text}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
