/**
 * Answering a class reminder from the dashboard (PAD-202 correction).
 *
 * The same two answers the chat's reminder message offers, recorded through the
 * same endpoint, so the backend treats a dashboard answer exactly like a chat
 * one (notifications.reminders rules 4–6, 10–13). `onAnswered` is how the page
 * refetches: the buttons disappear because the payload says the class is no
 * longer pending, never because the client guessed.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { respondToReminder } from "@/api/notificationEngine";

export type ReminderAnswer = "yes" | "no";

export function useAnswerReminder(onAnswered?: () => void | Promise<void>) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<number | null>(null);

  const answer = useCallback(
    async (lessonInstanceId: number, action: ReminderAnswer) => {
      if (busyId !== null) return;
      setBusyId(lessonInstanceId);
      try {
        const result = await respondToReminder(lessonInstanceId, action);
        if (result.action === "expired") {
          toast.error(t("dashboard.answer.expired"));
        } else {
          toast.success(t(result.action === "confirmed" ? "dashboard.answer.confirmed" : "dashboard.answer.declined"));
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
