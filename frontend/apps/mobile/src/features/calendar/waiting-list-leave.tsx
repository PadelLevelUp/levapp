import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import * as academyClassesApi from "@levelup/api/src/resources/academyClasses";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

/**
 * iOS port of web's `ClassWaitingListLeave.tsx` (PAD-934, calendar.view rule 23): "Sair da lista de
 * espera" in the class screen's waiting-list block. Asks once, inline, then calls the same leave
 * endpoint as the class-requests list; a 404 means the place is already gone, so it is no error.
 * The screen turns the block back into the join offer and reads the calendar again (`onLeft`).
 */
export function WaitingListLeave({ lessonInstanceId, onLeft }: { lessonInstanceId: number; onLeft: () => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await academyClassesApi.leaveClassWaitingList(lessonInstanceId);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) {
        toast.error(t("classRequests.waitingList.leaveFailed"));
        setBusy(false);
        setConfirming(false);
        return;
      }
    }
    setBusy(false);
    setConfirming(false);
    onLeft();
  };

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onPress={() => setConfirming(true)} testID="class-waiting-list-leave">
        <Text>{t("classRequests.academy.leaveWaitlist")}</Text>
      </Button>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center gap-2" testID="class-waiting-list-leave-confirm">
      <Text className="text-sm">{t("classRequests.waitingList.leaveConfirm")}</Text>
      <Button size="sm" variant="destructive" disabled={busy} onPress={() => void leave()} testID="class-waiting-list-leave-yes">
        <Text>{t("classRequests.waitingList.leaveYes")}</Text>
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onPress={() => setConfirming(false)} testID="class-waiting-list-leave-no">
        <Text>{t("classRequests.waitingList.cancel")}</Text>
      </Button>
    </View>
  );
}
