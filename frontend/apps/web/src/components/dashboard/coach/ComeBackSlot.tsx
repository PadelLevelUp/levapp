/**
 * PAD-684 (`attendance.confirm` rule 28, `dashboard.blocks` rule 3a): what a `not_coming`
 * student's hero / schedule row shows. The SERVER's `comeBack` decides which branch
 * (`comeBackAction`); the tap is decided by the server too (`respond_reminder` yes).
 *
 * The waiting-list join is addressed by the item's `declineTarget` ({model, originalId,
 * date}) - the same calendar-event ref the class detail passes to `joinClassWaitingList`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { respondToReminder } from "@/api/notificationEngine";
import { joinClassWaitingList } from "@/api/academyClasses";
import { comeBackAction, comeBackFromAnswer, reminderAnswerOutcome } from "@levelup/config";
import type { ComeBackAction } from "@levelup/config";
import { DeclinedHint } from "./AnswerButtons";

type Item = {
  lessonInstanceId?: number | null;
  comeBack?: "rejoin" | "waiting_list" | "on_waiting_list" | null;
  attendanceState?: "planned" | "coming" | "not_coming" | "attended" | "missed";
  declineTarget?: { model: string; originalId: string | number; date: string } | null;
};

export function ComeBackSlot({
  item,
  onAnswered,
  onNavy = false,
}: {
  item: Item;
  onAnswered?: () => void | Promise<void>;
  onNavy?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // The server's own answer, shown until the refetch lands (never invented).
  const [shown, setShown] = useState<ComeBackAction | null>(null);
  const kind = shown ?? comeBackAction(item.comeBack, item.attendanceState);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const textCls = onNavy ? "text-[13px] text-sidebar-foreground/80" : "text-xs text-muted-foreground";
  const outlineCls = onNavy
    ? "h-9 border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
    : "h-9";

  const comeBack = async () => {
    if (busy || typeof item.lessonInstanceId !== "number") return;
    setBusy(true);
    try {
      const answer = await respondToReminder(item.lessonInstanceId, "yes");
      const outcome = reminderAnswerOutcome(answer);
      const next = comeBackFromAnswer(answer);
      if (next) setShown(next);
      if (outcome.record === "confirmed") toast.success(t("dashboard.answer.confirmed"));
      else if (outcome.messageKey) {
        if (outcome.tone === "error") toast.error(t(outcome.messageKey));
        else toast(t(outcome.messageKey));
      }
      await onAnswered?.();
      setShown(null);
    } catch {
      toast.error(t("dashboard.answer.failed"));
    } finally {
      setBusy(false);
    }
  };

  const joinWaitingList = async () => {
    if (busy || !item.declineTarget) return;
    setBusy(true);
    try {
      const place = await joinClassWaitingList(item.declineTarget);
      if ((place as { onWaitingList?: boolean } | null)?.onWaitingList) setShown("on_waiting_list");
      toast.success(t("calendar.waitingList.joined"));
      await onAnswered?.();
      setShown(null);
    } catch {
      toast.error(t("calendar.waitingList.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (kind === "final_hint") return <DeclinedHint onNavy={onNavy} />;
  if (kind === "rejoin") {
    return (
      <div onClick={stop} onKeyDown={stop}>
        <Button
          size="sm"
          data-testid="dashboard-come-back"
          disabled={busy}
          className={
            onNavy ? "h-9 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "h-9"
          }
          onClick={comeBack}
        >
          {t("calendar.detail.comeBack")}
        </Button>
      </div>
    );
  }
  if (kind === "waiting_list") {
    return (
      <div className="flex flex-col gap-2" onClick={stop} onKeyDown={stop}>
        <p data-testid="dashboard-come-back-spot-taken" className={textCls}>
          {t("calendar.detail.spotTaken")}
        </p>
        <Button
          size="sm"
          variant="outline"
          data-testid="dashboard-come-back-waiting-list"
          disabled={busy}
          className={outlineCls}
          onClick={joinWaitingList}
        >
          {t("calendar.waitingList.join")}
        </Button>
      </div>
    );
  }
  if (kind === "on_waiting_list") {
    return (
      <p data-testid="dashboard-come-back-on-waiting-list" className={textCls}>
        {t("calendar.detail.onWaitingList")}
      </p>
    );
  }
  return null;
}
