import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { PastDueClass } from "@/api/notificationEngine";
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

/**
 * PAD-478 (notifications.config rule 10f): a saved timing put the reminder time of these classes
 * in the past. The save sent nothing; this asks the coach, once, whether to send now.
 *
 * Copy approved by the owner (2026-10-02): the body ends with the question, nothing after it, and
 * the two buttons name the two outcomes. Nothing is pre-chosen; closing the dialog is "do not send".
 */
export interface PastDueRemindersDialogProps {
  /** The classes asked about. One choice covers them all. Never empty. */
  classes: PastDueClass[];
  /** Set inside the coach's quiet hours: a yes is sent at this UTC instant, not now. */
  quietUntil: string | null;
  sending: boolean;
  /** The last attempt to send failed; the dialog stays open so the coach can try again. */
  failed: boolean;
  onSend: () => void;
  onDecline: () => void;
}

/** How many classes are named before the rest are counted. */
const LISTED = 5;

/** `2027-07-12T18:00:00` is the class's wall clock, with no zone: read its parts, never shift it. */
function wallClock(startsAt: string, language: string): { day: string; time: string } {
  const [date, clock = ""] = startsAt.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { day, time: clock.slice(0, 5) };
}

export function PastDueRemindersDialog({ classes, quietUntil, sending, failed, onSend, onDecline }: PastDueRemindersDialogProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const sendAt = quietUntil
    ? new Date(quietUntil).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })
    : null;
  const one = classes.length === 1 ? classes[0] : null;
  const label = (c: PastDueClass) => {
    const { day, time } = wallClock(c.startsAt, language);
    return { class: c.title, day, time };
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !sending) onDecline();
      }}
    >
      <AlertDialogContent data-testid="past-due-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(one ? "settings.engine.pastDue.titleOne" : "settings.engine.pastDue.titleMany")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground" data-testid="past-due-body">
              {one ? (
                <p>
                  {sendAt
                    ? t("settings.engine.pastDue.bodyOneQuiet", { ...label(one), sendAt })
                    : t("settings.engine.pastDue.bodyOne", label(one))}
                </p>
              ) : (
                <>
                  <p>{t("settings.engine.pastDue.introMany", { count: classes.length })}</p>
                  <ul className="list-disc pl-5" data-testid="past-due-list">
                    {classes.slice(0, LISTED).map((c) => (
                      <li key={c.key}>{t("settings.engine.pastDue.listItem", label(c))}</li>
                    ))}
                    {classes.length > LISTED && (
                      <li>{t("settings.engine.pastDue.andMore", { count: classes.length - LISTED })}</li>
                    )}
                  </ul>
                  <p>
                    {sendAt
                      ? t("settings.engine.pastDue.questionManyQuiet", { sendAt })
                      : t("settings.engine.pastDue.questionMany")}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive" data-testid="past-due-error">
            {t("settings.engine.pastDue.sendFailed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending} data-testid="past-due-decline">
            {t("settings.engine.pastDue.decline")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={sending}
            data-testid="past-due-send"
            onClick={(e) => {
              // Stay open until the server has answered: a failure is shown here, not lost.
              e.preventDefault();
              onSend();
            }}
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sendAt
              ? t("settings.engine.pastDue.sendAt", { time: sendAt })
              : one
                ? t("settings.engine.pastDue.sendOne")
                : t("settings.engine.pastDue.sendMany")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
