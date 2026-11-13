/**
 * PAD-933 (notifications.manual NM2, NOTIFICATIONS-MANUAL-11): where the class screen's Notificar
 * stands. A new-engine class has no manual invitations until they go through the engine (owner
 * decision 17), so Notificar is not offered and the dashboard's `notify=1` opens nothing; a class
 * that has started shows the warning instead (PAD-798, rule 10). The engine check is the shared
 * `manualInviteClosed`, so a payload without `engineVersion` (an older server) keeps today's button.
 */
import { Ionicons } from "@expo/vector-icons";
import { lightTheme, manualInviteClosed } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export type NotifyState = "open" | "started" | "engine";

export function notifyState(engineVersion: string | null | undefined, started: boolean): NotifyState {
  if (manualInviteClosed(engineVersion)) return "engine";
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
  if (state === "engine") return null;
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
