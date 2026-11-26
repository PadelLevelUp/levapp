/**
 * calendar.student-blockers rule 21 (PAD-772): after a block is saved and the save answers covered
 * classes, ONE dialog lists them and asks whether the student is not going. Only "Sim, não vou" marks
 * them (through the shared decision in `@levelup/config`); "Manter as aulas" changes nothing. The block is
 * already saved: a failed mark says so and leaves it. Used by the Disponibilidade tab, the calendar's block
 * sheet and the setup guide's schedule step; twin of iOS's `features/availability/blocker-covered-dialog.tsx`.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { coveredClassParts, decideCoveredFollowUp, type CoveredClass } from "@levelup/config";
import { refreshAfterCoveredMark } from "@levelup/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { declineCoveredClasses } from "@/api/availability";

export function useBlockerCoveredFollowUp(): {
  /** Run after a block save with the save's answer (or the schedule read's list); resolves when it is all over. */
  follow: (answer: { coveredClasses?: unknown } | null | undefined) => Promise<void>;
  dialog: ReactNode;
} {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<CoveredClass[] | null>(null);
  const answer = useRef<((choice: "yes" | "keep") => void) | null>(null);

  const ask = useCallback(
    (classes: CoveredClass[]) =>
      new Promise<"yes" | "keep">((resolve) => {
        answer.current = (choice) => {
          answer.current = null;
          setAsking(null);
          resolve(choice);
        };
        setAsking(classes);
      }),
    []
  );

  const follow = useCallback(
    async (saveAnswer: { coveredClasses?: unknown } | null | undefined) => {
      const outcome = await decideCoveredFollowUp(saveAnswer, ask, declineCoveredClasses);
      if (outcome.answered !== "yes") return;
      if (outcome.failed) {
        toast({ variant: "destructive", title: t("availability.covered.failed") });
        return;
      }
      if (outcome.marked > 0) {
        void refreshAfterCoveredMark(queryClient);
        toast({ title: t("availability.covered.marked", { count: outcome.marked }) });
      } else {
        toast({ title: t("availability.covered.markedNone") });
      }
    },
    [ask, queryClient, t, toast]
  );

  const dialog = (
    <AlertDialog open={asking !== null}>
      <AlertDialogContent data-testid="blocker-covered-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("availability.covered.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("availability.covered.body", { count: asking?.length ?? 0 })}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {(asking ?? []).map((c, index) => (
            <li key={`${c.model}-${c.originalId}-${c.date}`} data-testid={`blocker-covered-item-${index}`}>
              {t("availability.covered.item", coveredClassParts(c, i18n?.language ?? "pt"))}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="blocker-covered-keep" onClick={() => answer.current?.("keep")}>
            {t("availability.covered.keep")}
          </AlertDialogCancel>
          <AlertDialogAction data-testid="blocker-covered-decline" onClick={() => answer.current?.("yes")}>
            {t("availability.covered.decline")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { follow, dialog };
}
