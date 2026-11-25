import * as React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useClassCancellations } from "@levelup/hooks";

import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

interface ClassCancellationsSectionProps {
  lessonId?: string;
  enabled: boolean;
  /** How the class screen writes a date. */
  formatDate: (iso: string) => string;
}

/**
 * Ports web's ClassCancellationsSection (classes.delete rule 14, PAD-840): the class's cancellations that
 * had a reason, newest date first. The coach's only; a class with none shows nothing.
 */
export function ClassCancellationsSection({ lessonId, enabled, formatDate }: ClassCancellationsSectionProps) {
  const { t } = useTranslation();
  const { data } = useClassCancellations(lessonId, enabled);
  if (!enabled || !data?.length) return null;
  return (
    <>
      <Separator />
      <View className="gap-2" testID="class-cancellations">
        <Text className="text-sm font-medium">{t("calendar.cancellations.title")}</Text>
        {data.map((c) => (
          <View key={`${c.date}-${c.scope}-${c.reason}`} testID="class-cancellation-row">
            <Text className="text-sm font-medium">
              {formatDate(c.date) + (c.scope === "future" ? ` ${t("calendar.cancellations.andFollowing")}` : "")}
            </Text>
            <Text className="text-sm">{c.reason}</Text>
            <Text className="text-xs text-muted-foreground">
              {t(c.sentToStudents ? "calendar.cancellations.sent" : "calendar.cancellations.notSent")}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
