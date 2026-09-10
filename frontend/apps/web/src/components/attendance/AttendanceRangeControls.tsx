import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AttendanceRange, AttendanceRangePreset } from "./dateRanges";

const PRESETS: Array<{ key: AttendanceRangePreset; labelKey: string; ariaKey: string }> = [
  { key: "1w", labelKey: "attendance.ranges.week", ariaKey: "attendance.ranges.weekAria" },
  { key: "1m", labelKey: "attendance.ranges.month", ariaKey: "attendance.ranges.monthAria" },
  { key: "1y", labelKey: "attendance.ranges.year", ariaKey: "attendance.ranges.yearAria" },
  { key: "season", labelKey: "attendance.ranges.season", ariaKey: "attendance.ranges.seasonAria" },
];

/**
 * PAD-114 — the range controls that sit BELOW the chart (spec rule 10).
 *
 * Three presets plus `…`, which reveals a from/to pair for a custom period. The
 * user never picks a granularity: the server derives it from the span and echoes
 * it back, so there is nothing here to keep in sync with the backend rule.
 *
 * `Clear` only exists while a custom period is applied — clearing drops it and
 * restores the preset view, from which a new custom period can be set (rule 12).
 */
export function AttendanceRangeControls({
  preset,
  customRange,
  onSelectPreset,
  onApplyCustom,
  onClearCustom,
  seasonAvailable = false,
}: {
  preset: AttendanceRangePreset;
  customRange: AttendanceRange | null;
  onSelectPreset: (preset: AttendanceRangePreset) => void;
  onApplyCustom: (range: AttendanceRange) => void;
  onClearCustom: () => void;
  /** calendar.seasons rule 14: the Season preset exists only for a coach whose season has a current occurrence. */
  seasonAvailable?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [from, setFrom] = useState(customRange?.from ?? "");
  const [to, setTo] = useState(customRange?.to ?? "");
  const [invalid, setInvalid] = useState(false);

  // Keep the fields in step when the active custom period changes elsewhere
  // (e.g. Clear), so reopening `…` never shows a stale period.
  useEffect(() => {
    setFrom(customRange?.from ?? "");
    setTo(customRange?.to ?? "");
    if (customRange) setExpanded(true);
  }, [customRange]);

  const handleApply = () => {
    if (!from || !to || from > to) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onApplyCustom({ from, to });
  };

  const handleClear = () => {
    setInvalid(false);
    setExpanded(false);
    onClearCustom();
  };

  return (
    <div data-testid="attendance-range-controls" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.filter((item) => item.key !== "season" || seasonAvailable).map((item) => {
          const active = !customRange && preset === item.key;
          return (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              aria-label={t(item.ariaKey)}
              data-testid={`attendance-range-${item.key}`}
              onClick={() => {
                setExpanded(false);
                setInvalid(false);
                onSelectPreset(item.key);
              }}
              className="min-w-[3rem]"
            >
              {t(item.labelKey)}
            </Button>
          );
        })}

        <Button
          type="button"
          size="sm"
          variant={customRange ? "default" : "outline"}
          aria-pressed={Boolean(customRange)}
          aria-expanded={expanded}
          aria-label={t("attendance.ranges.customAria")}
          data-testid="attendance-range-custom"
          onClick={() => setExpanded((open) => !open)}
          className="min-w-[3rem]"
        >
          {t("attendance.ranges.custom")}
        </Button>

        {customRange ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="attendance-range-clear"
            onClick={handleClear}
          >
            <X className="mr-1 h-4 w-4" />
            {t("attendance.ranges.clear")}
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div
          data-testid="attendance-custom-fields"
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <div className="space-y-1">
            <Label htmlFor="attendance-from" className="text-xs">
              {t("attendance.ranges.from")}
            </Label>
            <Input
              id="attendance-from"
              type="date"
              value={from}
              data-testid="attendance-custom-from"
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[10.5rem]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="attendance-to" className="text-xs">
              {t("attendance.ranges.to")}
            </Label>
            <Input
              id="attendance-to"
              type="date"
              value={to}
              data-testid="attendance-custom-to"
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[10.5rem]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="attendance-custom-apply"
            onClick={handleApply}
          >
            {t("attendance.ranges.apply")}
          </Button>
          <p
            className={cn(
              "w-full text-xs text-destructive",
              invalid ? "" : "hidden"
            )}
            role={invalid ? "alert" : undefined}
          >
            {t("attendance.ranges.invalid")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
