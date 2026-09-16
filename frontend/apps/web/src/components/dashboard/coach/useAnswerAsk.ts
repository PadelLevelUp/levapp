/**
 * Answering the two chat-born asks from the dashboard (PAD-236): an engine
 * invitation ("a spot opened, want it?") and a waiting-list offer. Same
 * endpoints the chat bubbles call, so the backend records the answer exactly
 * as if it were given in the chat and settles the bubble (`responded`) — the
 * card leaves on the refetch because the payload no longer lists it.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { respondToNotification, respondToWaitingList } from "@/api/notificationEngine";
import type { ReminderAnswer } from "./useAnswerReminder";

export function useAnswerVacancyInvite(onAnswered?: () => void | Promise<void>) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<number | null>(null);

  const answer = useCallback(
    async (notificationEventId: number, action: ReminderAnswer) => {
      if (busyId !== null) return;
      setBusyId(notificationEventId);
      try {
        const result = await respondToNotification(notificationEventId, action);
        switch (result.action) {
          case "confirmed":
            toast.success(t("dashboard.answer.confirmed"));
            break;
          case "declined":
            toast.success(t("dashboard.answer.inviteDeclined"));
            break;
          case "spot_filled":
          case "spot_filled_waiting_list_offered":
            toast.info(t("dashboard.answer.spotFilled"));
            break;
          case "expired":
            toast.error(t("dashboard.answer.expired"));
            break;
          default:
            toast.error(t("dashboard.answer.failed"));
        }
        await onAnswered?.();
      } catch {
        toast.error(t("dashboard.answer.failed"));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, onAnswered, t],
  );

  return { answer, busyId };
}

export function useAnswerWaitingListOffer(onAnswered?: () => void | Promise<void>) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<number | null>(null);

  const answer = useCallback(
    async (lessonInstanceId: number, action: ReminderAnswer) => {
      if (busyId !== null) return;
      setBusyId(lessonInstanceId);
      try {
        const result = await respondToWaitingList(lessonInstanceId, action);
        switch (result.action) {
          case "added_to_waiting_list":
            toast.success(t("dashboard.answer.joinedWaitingList"));
            break;
          case "declined":
            toast.success(t("dashboard.answer.offerDeclined"));
            break;
          case "expired":
            toast.error(t("dashboard.answer.expired"));
            break;
          default:
            // "unknown": nothing recorded, so the card stays until the refetch says otherwise.
            toast.error(t("dashboard.answer.failed"));
        }
        await onAnswered?.();
      } catch {
        toast.error(t("dashboard.answer.failed"));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, onAnswered, t],
  );

  return { answer, busyId };
}
