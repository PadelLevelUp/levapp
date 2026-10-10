/** Yes / No for a class the student was asked to confirm (PAD-202 correction). */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import type { ReminderAnswer } from "./useAnswerReminder";

export function AnswerButtons({
  busy,
  onAnswer,
  className,
  onNavy = false,
}: {
  busy: boolean;
  onAnswer: (action: ReminderAnswer) => void;
  className?: string;
  /** On the navy hero the outline button must read against navy, not card. */
  onNavy?: boolean;
}) {
  const { t } = useTranslation();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className={className} onClick={stop} onKeyDown={stop} data-testid="dashboard-confirm">
      <Button
        size="sm"
        data-testid="dashboard-confirm-yes"
        disabled={busy}
        className={onNavy ? "h-9 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "h-9"}
        onClick={() => onAnswer("yes")}
      >
        {t("dashboard.answer.yes")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        data-testid="dashboard-confirm-no"
        disabled={busy}
        className={onNavy ? "h-9 border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent" : "h-9"}
        onClick={() => onAnswer("no")}
      >
        {t("dashboard.answer.no")}
      </Button>
    </div>
  );
}

/**
 * PAD-570 (dashboard.blocks rule 3a): before the student is asked, or once they
 * said yes, a row offers ONE thing — "Avisar que não vou" — behind a dialog that
 * says the consequence (the spot is freed; there is no way back, rule 28).
 */
export function DeclineButton({
  busy,
  onDecline,
  className,
  onNavy = false,
}: {
  busy: boolean;
  onDecline: () => void;
  className?: string;
  onNavy?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className={className} onClick={stop} onKeyDown={stop} data-testid="dashboard-decline">
      <Button
        size="sm"
        variant="outline"
        data-testid="dashboard-decline-open"
        disabled={busy}
        className={onNavy ? "h-9 border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent" : "h-9"}
        onClick={() => setOpen(true)}
      >
        {t("dashboard.answer.notGoing")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboard.answer.notGoingTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dashboard.answer.notGoingBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("dashboard.answer.notGoingKeep")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="dashboard-decline-confirm"
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onDecline();
              }}
            >
              {t("dashboard.answer.notGoingConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** PAD-570 rule 28: after "Não vou" a row shows this line and no button. */
export function DeclinedHint({ onNavy = false }: { onNavy?: boolean }) {
  const { t } = useTranslation();
  return (
    <p
      data-testid="dashboard-declined-hint"
      className={onNavy ? "text-[13px] text-sidebar-foreground/80" : "text-xs text-muted-foreground"}
    >
      {t("calendar.detail.declinedFinalHint")}
    </p>
  );
}
