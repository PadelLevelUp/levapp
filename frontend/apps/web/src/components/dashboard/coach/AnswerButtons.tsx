/** Yes / No for a class the student was asked to confirm (PAD-202 correction). */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
