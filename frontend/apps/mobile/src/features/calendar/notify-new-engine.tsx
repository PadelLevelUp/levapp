/**
 * Where the class screen's Notificar stands (notifications.manual NM2, NOTIFICATIONS-MANUAL-11): offered
 * on both engines, since PAD-932 sends a new-engine class's manual invitations through the engine
 * (NM1); a class that has started shows the warning instead (PAD-798, rule 10). PAD-933's stopgap hid
 * it on a new-engine class; `engineVersion` stays in the signature so the screen's call reads the same.
 */
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export type NotifyState = "open" | "started";

export function notifyState(_engineVersion: string | null | undefined, started: boolean): NotifyState {
  return started ? "started" : "open";
}

/** `notify=1` opens the picker once, and only where Notificar itself is offered. */
export function shouldAutoOpenNotify(
  notifyParam: string | undefined,
  ready: boolean,
  state: NotifyState,
  alreadyOpened: boolean
): boolean {
  return notifyParam === "1" && ready && state === "open" && !alreadyOpened;
}

export function ClassNotifyAction({ state, onOpen }: { state: NotifyState; onOpen: () => void }) {
  const { t } = useTranslation();
  if (state === "started") {
    return (
      <Text className="flex-1 self-center text-sm text-muted-foreground" testID="class-notify-closed">
        {t("calendar.notify.classStarted")}
      </Text>
    );
  }
  return (
    <Button
      variant="outline"
      className="flex-1"
      testID="class-notify"
      accessibilityLabel={t("classDetail.notifyStudentsAria")}
      onPress={onOpen}
    >
      <Ionicons name="send-outline" size={16} color={lightTheme.foreground} />
      <Text>{t("calendar.detail.notify")}</Text>
    </Button>
  );
}
