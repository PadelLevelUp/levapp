import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { leaveClassWaitingList } from "@/api/academyClasses";
import { useToast } from "@/hooks/use-toast";

/**
 * PAD-934 (calendar.view rule 23): "Sair da lista de espera" in the class detail's waiting-list
 * block. Asks once, inline, then calls the same leave endpoint as the class-requests list
 * (`classes.academy-class-booking` rule 7): a 404 means the place is already gone, so it is no error.
 * The caller turns the block back into the join offer and reads the calendar again (`onLeft`).
 */
export function ClassWaitingListLeave({ lessonInstanceId, onLeft }: { lessonInstanceId: number; onLeft: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await leaveClassWaitingList(lessonInstanceId);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) {
        toast({ variant: "destructive", title: t("classRequests.waitingList.leaveFailed") });
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
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} data-testid="class-waiting-list-leave">
        {t("classRequests.academy.leaveWaitlist")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="class-waiting-list-leave-confirm">
      <span className="text-sm">{t("classRequests.waitingList.leaveConfirm")}</span>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void leave()} data-testid="class-waiting-list-leave-yes">
        {t("classRequests.waitingList.leaveYes")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)} data-testid="class-waiting-list-leave-no">
        {t("classRequests.waitingList.cancel")}
      </Button>
    </div>
  );
}
