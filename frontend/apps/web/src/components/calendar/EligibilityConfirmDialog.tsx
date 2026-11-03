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
  sideGone = null,
}: {
  open: boolean;
  ineligible: EligibilityCheckEntry[];
  onCancel: () => void;
  onConfirm: () => void;
  /** eligibility.enforcement rule 6a (PAD-562): the same dialog for a manual invite, with the
   *  invite verb — "Convidar alunos…?" / "Convidar mesmo assim". */
  action?: "add" | "invite";
  /** classes.join-requests rule 7a (PAD-808): accepting a request whose side has no open spot
   *  left — the side asked for and the student's name. Alone it is the dialog's whole message;
   *  with failing students it is added below them, in the one confirmation. */
  sideGone?: { side: "left" | "right"; name: string } | null;
}) {
  const { t } = useTranslation();
  // One entry per verb (eligibility.enforcement rules 6 and 6a): the add dialog's copy, or the
  // invite dialog's — the same sentence with the verb swapped.
  const copy = COPY[action];
  const students = describeIneligible(ineligible);
  const sideOnly = sideGone != null && students.length === 0;
  const sideLine = sideGone
    ? t(sideGone.side === "left" ? "calendar.eligibilityConfirm.sideGoneLeft" : "calendar.eligibilityConfirm.sideGoneRight", { name: sideGone.name })
    : null;

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent data-testid="eligibility-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t(sideOnly ? "calendar.eligibilityConfirm.sideTitle" : copy.title)}
          </AlertDialogTitle>
          <AlertDialogDescription>{sideOnly ? sideLine : t(copy.body)}</AlertDialogDescription>
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
        {sideLine && !sideOnly ? (
          <p className="text-sm" data-testid="eligibility-confirm-side">
            {sideLine}
          </p>
        ) : null}
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
            {t(sideOnly ? "calendar.eligibilityConfirm.sideConfirm" : copy.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
