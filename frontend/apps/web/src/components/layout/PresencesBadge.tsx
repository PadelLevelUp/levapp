import { useTranslation } from "react-i18next";
import { validationTier } from "@levelup/config";
import { cn } from "@/lib/utils";

/**
 * PAD-443 (`attendance.validation` rule 23): the classes still to validate, on the Presences nav
 * item. `count` is the dashboard's number (`usePendingValidationBadge`); the tier comes from the
 * shared `validationTier`, so web and iOS agree on yellow (1–5) and red (above 5). The number is
 * always shown, so the colour is never the only signal; the label names it for screen readers.
 */
export function PresencesBadge({
  count,
  className,
  testId = "nav-presences-badge",
}: {
  count: number;
  className?: string;
  /** Both nav renderings are in the DOM at once (sidebar and bottom bar), as with the unread badge. */
  testId?: string;
}) {
  const { t } = useTranslation();
  const tier = validationTier(count);
  if (tier === "none") return null;
  return (
    <span
      data-testid={testId}
      data-tier={tier}
      role="status"
      aria-label={t("nav.presencesBadge", { count })}
      className={cn(
        "min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center px-1",
        tier === "attention" ? "bg-yellow-400 text-yellow-950" : "bg-destructive text-destructive-foreground",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
