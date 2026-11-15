import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, Star } from "lucide-react";
import { isValidCustomRange, type PresencePeriodShortcut } from "@levelup/config";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** What the coach picked: a shortcut, or a custom from/to. */
export type PresencePeriodChoice =
  | { shortcut: PresencePeriodShortcut }
  | { from: string; to: string };

/** "2026-09-01" → "01/09/2026"; the echoed `to` may carry a time after the clamp (rule 17h). */
function dayLabel(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * PAD-837 (attendance.validation rule 17g): the tab's one period, at the top of the reporting
 * surface. Shortcuts and a custom from/to (checked by `isValidCustomRange`); the label is the
 * period the server echoed, not the one asked for; "Usar como predefinido" makes the picked
 * shortcut the coach's default (rule 17f).
 */
export function PresencePeriodControl({
  shortcuts,
  choice,
  echoed,
  defaultPeriod,
  onChoose,
  onMakeDefault,
}: {
  shortcuts: PresencePeriodShortcut[];
  choice: PresencePeriodChoice;
  /** The payload's `from`/`to`; `null` while the first answer is out. */
  echoed: { from: string; to: string } | null;
  defaultPeriod: PresencePeriodShortcut;
  onChoose: (choice: PresencePeriodChoice) => void;
  onMakeDefault: (shortcut: PresencePeriodShortcut) => void;
}) {
  const { t } = useTranslation();
  const isCustom = !("shortcut" in choice);
  const [customOpen, setCustomOpen] = useState(isCustom);
  const [from, setFrom] = useState(isCustom ? choice.from : "");
  const [to, setTo] = useState(isCustom ? choice.to : "");
  const picked = "shortcut" in choice ? choice.shortcut : null;

  return (
    <section
      data-testid="presences-period"
      aria-label={t("presences.period.label")}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm"
    >
      <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
      <div className="flex flex-wrap gap-1" role="group">
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut}
            size="sm"
            variant={picked === shortcut && !customOpen ? "default" : "ghost"}
            aria-pressed={picked === shortcut && !customOpen}
            data-testid={`presences-period-${shortcut}`}
            onClick={() => {
              setCustomOpen(false);
              onChoose({ shortcut });
            }}
          >
            {t(`presences.period.${shortcut}`)}
          </Button>
        ))}
        <Button
          size="sm"
          variant={customOpen ? "default" : "ghost"}
          aria-pressed={customOpen}
          data-testid="presences-period-custom"
          onClick={() => setCustomOpen((open) => !open)}
        >
          {t("presences.period.custom")}
        </Button>
      </div>

      {customOpen && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValidCustomRange(from, to)) onChoose({ from, to });
          }}
        >
          <Input
            type="date"
            className="h-8 w-[9.5rem]"
            aria-label={t("presences.period.from")}
            data-testid="presences-period-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            type="date"
            className="h-8 w-[9.5rem]"
            aria-label={t("presences.period.to")}
            data-testid="presences-period-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Button size="sm" type="submit" data-testid="presences-period-apply" disabled={!isValidCustomRange(from, to)}>
            {t("presences.period.apply")}
          </Button>
        </form>
      )}

      <span className="ml-auto flex items-center gap-2">
        <span data-testid="presences-period-label" className="text-sm tabular-nums text-muted-foreground">
          {echoed ? t("presences.period.showing", { from: dayLabel(echoed.from), to: dayLabel(echoed.to) }) : "…"}
        </span>
        {picked && !customOpen && (
          picked === defaultPeriod ? (
            <span
              data-testid="presences-period-is-default"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Star className="h-3 w-3" aria-hidden />
              {t("presences.period.isDefault")}
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-testid="presences-period-make-default"
              className={cn("h-8")}
              onClick={() => onMakeDefault(picked)}
            >
              {t("presences.period.makeDefault")}
            </Button>
          )
        )}
      </span>
    </section>
  );
}
