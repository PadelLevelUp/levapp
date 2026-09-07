import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type Props = {
  participantName: string;
  /** Opens the existing block confirmation. */
  onBlock: () => void;
  /** Opens the report dialog with the `unsolicited` preset and Report-and-block. */
  onReport: () => void;
};

/**
 * messaging.block-and-report rule 8 (PAD-215): shown above the thread while the
 * server reports `isKnownContact: false` — the other participant is not one of
 * the viewer's coaches, shares no club with them, and the viewer has never
 * written in this thread. Mirrors web's UnknownSenderBanner.
 */
export function UnknownSenderBanner({ participantName, onBlock, onReport }: Props) {
  const { t } = useTranslation();
  return (
    <View
      testID="unknown-sender-banner"
      accessibilityRole="alert"
      className="mx-3 mt-3 gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3"
    >
      <View className="flex-row items-start gap-2">
        <Ionicons name="shield-outline" size={18} color={lightTheme.destructive} />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium">
            {t("messages.unknownSender.title", { name: participantName })}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t("messages.unknownSender.description")}
          </Text>
        </View>
      </View>
      <View className="flex-row justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          testID="unknown-sender-report"
          accessibilityLabel={t("messages.unknownSender.report")}
          onPress={onReport}
        >
          <Text>{t("messages.unknownSender.report")}</Text>
        </Button>
        <Button
          size="sm"
          variant="destructive"
          testID="unknown-sender-block"
          accessibilityLabel={t("messages.unknownSender.block")}
          onPress={onBlock}
        >
          <Text>{t("messages.unknownSender.block")}</Text>
        </Button>
      </View>
    </View>
  );
}
