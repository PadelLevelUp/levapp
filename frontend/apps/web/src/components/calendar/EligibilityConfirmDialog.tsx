/**
 * PAD-150 — "these students don't meet the bar; add them anyway?"
 *
 * eligibility.enforcement rules 6, 7 and 7d: one block per failing student,
 * one line per failed rule, rendered through the shared renderer the invite
 * tutorial uses. Confirm proceeds with the save; Cancel aborts it and leaves
 * the coach in the edit with the draft intact. It warns, it never blocks.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { EligibilityCheckEntry } from "@levelup/types";
import { describeIneligible, resolveText } from "@levelup/config";
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

export function EligibilityConfirmDialog({
  open,
  ineligible,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  ineligible: EligibilityCheckEntry[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const students = describeIneligible(ineligible);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent data-testid="eligibility-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t("calendar.eligibilityConfirm.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("calendar.eligibilityConfirm.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-2 text-sm">
          {students.map((s) => (
            <li key={s.playerId} data-testid="eligibility-confirm-student">
              <span className="font-medium">{s.name}</span>
              <ul className="ml-4 list-disc text-muted-foreground">
                {s.reasons.map((r, i) => (
                  <li key={i} data-testid="eligibility-confirm-reason">
                    {resolveText(t, r)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} data-testid="eligibility-confirm-cancel">
            {t("calendar.eligibilityConfirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            data-testid="eligibility-confirm-proceed"
          >
            {t("calendar.eligibilityConfirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
