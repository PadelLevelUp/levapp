/**
 * calendar.student-blockers rule 21 (PAD-772, owner correction 26 Nov 2026): a saved availability block has
 * already marked the classes it covers "Não vai" on the server; nothing is asked. The shared decision in
 * `@levelup/config` says what the save's answer shows: one count toast and a re-read of the student's calendar,
 * class screens and dashboard when something was marked, nothing otherwise. Twin of web's
 * `components/availability/useBlockerSaveFollowUp.ts`.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { followUpOfSave } from "@levelup/config";
import { refreshAfterCoveredMark } from "@levelup/hooks";
import { toast } from "@/components/ui/toast";

export function useBlockerSaveFollowUp(): (answer: { markedClasses?: unknown } | null | undefined) => void {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return React.useCallback(
    (answer) => {
      try {
        const { marked, refresh } = followUpOfSave(answer);
        if (marked > 0) toast.success(t("availability.covered.marked", { count: marked }));
        if (refresh) void refreshAfterCoveredMark(queryClient);
      } catch {
        // The block is saved: a line that cannot be shown is not worth an error of its own.
      }
    },
    [queryClient, t]
  );
}
