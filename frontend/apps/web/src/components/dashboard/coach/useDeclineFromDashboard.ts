/**
 * "Avisar que não vou" from the dashboard (PAD-570, dashboard.blocks rule 3a).
 *
 * Before the student is asked (or after a yes) a row offers ONE decline, which goes
 * through `cancel_attendance` — the same endpoint as the class detail's — so the
 * SERVER classifies it (proactive or not, `attendance.confirm` rule 11) and a
 * projected occurrence is materialised from its `declineTarget`. `onAnswered` is how
 * the page refetches: the button leaves because the payload now says `not_coming`.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cancelAttendance } from "@/api/notificationEngine";

export type DeclineTarget = number | { model: string; originalId: string | number; date: string };

export function useDeclineFromDashboard(onAnswered?: () => void | Promise<void>) {
  const { t } = useTranslation();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const decline = useCallback(
    async (target: DeclineTarget, key: string) => {
      if (busyKey !== null) return;
      setBusyKey(key);
      try {
        await cancelAttendance(target);
        toast.success(t("dashboard.answer.notGoingDone"));
        await onAnswered?.();
      } catch {
        toast.error(t("dashboard.answer.notGoingFailed"));
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, onAnswered, t],
  );

  return { decline, busyKey };
}
