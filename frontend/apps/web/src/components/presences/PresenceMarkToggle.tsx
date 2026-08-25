import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { PresenceMark } from "./presenceStatus";

const OPTIONS: PresenceMark[] = ["present", "justified", "unjustified"];

/**
 * PAD-140 — the three-way present/justified/unjustified control.
 *
 * Semantically identical to `AttendanceRow`'s controls in the class-detail
 * sheet — both write the same `status` + `justification` pair, through the
 * shared mapping in `presenceStatus.ts`. The presentation differs on purpose:
 * `AttendanceRow` is one player in a roomy sheet (avatar, invite badges,
 * tooltips), while this renders dozens of players across many classes in a
 * scrolling dialog, where that chrome would drown the task.
 *
 * There is deliberately no "clear" affordance: once a coach has decided, the
 * way back is to pick a different answer, not to reopen the question.
 */
export function PresenceMarkToggle({
  value,
  onChange,
  size = "sm",
  disabled,
  playerName,
}: {
  value: PresenceMark | null;
  onChange: (mark: PresenceMark) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  playerName: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex shrink-0 gap-1"
      role="group"
      aria-label={t("presences.validate.statusFor", { name: playerName })}
    >
      {OPTIONS.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            data-testid={`presence-mark-${option}`}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md border font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              !active && "border-border bg-background text-muted-foreground hover:bg-muted",
              // Semantic colour, not the brand accent: these encode an outcome.
              active &&
                option === "present" &&
                "border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              active &&
                option === "justified" &&
                "border-border bg-muted text-foreground",
              active &&
                option === "unjustified" &&
                "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            {t(
              size === "sm"
                ? `presences.mark.short.${option}`
                : `presences.mark.${option}`
            )}
          </button>
        );
      })}
    </div>
  );
}
