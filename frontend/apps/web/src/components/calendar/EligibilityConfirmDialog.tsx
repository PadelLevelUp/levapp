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

const COPY = {
  add: {
    title: "calendar.eligibilityConfirm.title",
    body: "calendar.eligibilityConfirm.body",
    confirm: "calendar.eligibilityConfirm.confirm",
  },
  invite: {
    title: "calendar.eligibilityConfirm.inviteTitle",
    body: "calendar.eligibilityConfirm.inviteBody",
    confirm: "calendar.eligibilityConfirm.inviteConfirm",
  },
} as const;

export function EligibilityConfirmDialog({
  open,
  ineligible,
  onCancel,
  onConfirm,
  action = "add",
}: {
  open: boolean;
  ineligible: EligibilityCheckEntry[];
  onCancel: () => void;
  onConfirm: () => void;
  /** eligibility.enforcement rule 6a (PAD-562): the same dialog for a manual invite, with the
   *  invite verb — "Convidar alunos…?" / "Convidar mesmo assim". */
  action?: "add" | "invite";
}) {
  const { t } = useTranslation();
  // One entry per verb (eligibility.enforcement rules 6 and 6a): the add dialog's copy, or the
  // invite dialog's — the same sentence with the verb swapped.
  const copy = COPY[action];
  const students = describeIneligible(ineligible);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent data-testid="eligibility-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t(copy.title)}
          </AlertDialogTitle>
          <AlertDialogDescription>{t(copy.body)}</AlertDialogDescription>
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
            {t(copy.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
