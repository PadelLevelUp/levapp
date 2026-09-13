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
import { reminderAnswerOutcome } from "@levelup/config";

export type ReminderAnswer = "yes" | "no";

export function useAnswerReminder(onAnswered?: () => void | Promise<void>) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<number | null>(null);

  const answer = useCallback(
    async (lessonInstanceId: number, action: ReminderAnswer) => {
      if (busyId !== null) return;
      setBusyId(lessonInstanceId);
      try {
        // B-074: this branched on three values against a server that answers
        // five, so anything it did not know became a SUCCESS toast reading
        // "declined". The shared mapper decides; an answer it cannot name says
        // so instead of picking the common case.
        const outcome = reminderAnswerOutcome(await respondToReminder(lessonInstanceId, action));
        if (outcome.record === "confirmed") toast.success(t("dashboard.answer.confirmed"));
        else if (outcome.record === "declined") toast.success(t("dashboard.answer.declined"));
        else if (outcome.messageKey) {
          if (outcome.tone === "error") toast.error(t(outcome.messageKey));
          else toast(t(outcome.messageKey));
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
