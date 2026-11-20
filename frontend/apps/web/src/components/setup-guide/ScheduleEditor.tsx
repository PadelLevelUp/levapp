/**
 * PAD-839 (dashboard.student-setup-guide rule 9): the schedule editor on web. Every rule it follows
 * lives in `@levelup/config/availability-schedule`; this file only draws the state and forwards taps.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, X } from "lucide-react";
import {
  SCHEDULE_NAME_SUGGESTIONS,
  SCHEDULE_WEEK_ORDER,
  canSave,
  copyOpenDayTo,
  gridHint,
  gridHours,
  gridTap,
  hourCell,
  periodLength,
  periodsOf,
  removePeriod,
  scheduleSummary,
  setDays,
  slotLabel,
  slotsInView,
  stepPeriod,
  toSame,
  toVaries,
  toggleDay,
  toggleName,
  weekRowText,
  weekSlots,
  withSlotsInView,
  emptySlots,
  type HourCell,
  type Schedule,
} from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CELL: Record<HourCell, string> = {
  busy: "bg-primary/10 border border-primary/40 text-primary",
  half: "bg-primary/5 border border-dashed border-primary/40 text-primary",
  free_end: "bg-background border border-dashed border-primary/40 shadow-[inset_4px_0_0_hsl(var(--primary)/0.4)]",
  anchor: "bg-background border-2 border-primary text-primary",
  free: "bg-background border border-border",
};

export function ScheduleEditor({
  open,
  initial,
  editing,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  initial: Schedule;
  /** True when editing a saved schedule: the title, the save label and "Apagar bloqueio". */
  editing: boolean;
  saving?: boolean;
  onSave: (schedule: Schedule) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [s, setS] = useState<Schedule>(initial);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    // A new `initial` (another preset or schedule) resets the editor.
    setSeed(initial);
    setS(initial);
    setAnchor(null);
    setCopyOpen(false);
  }

  const slots = slotsInView(s);
  const grid = { slots, anchor };
  const varies = s.mode === "varies";
  const dayName = (d: number) => t(`availability.days.${d}`);
  const summary = scheduleSummary(s);

  const tapHour = (h: number) => {
    const next = gridTap(grid, h);
    setAnchor(next.anchor);
    setS(withSlotsInView(s, next.slots));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="bottom" className="mx-auto max-h-[92vh] max-w-xl overflow-y-auto rounded-t-2xl" data-testid="schedule-editor">
        <SheetHeader className="text-left">
          <SheetTitle>{editing ? t("setupGuide.editor.titleEdit") : t("setupGuide.editor.titleNew")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="radiogroup">
            {(["same", "varies"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={s.mode === m}
                data-testid={`schedule-mode-${m}`}
                className={`rounded-md py-1.5 text-sm ${s.mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                onClick={() => {
                  setAnchor(null);
                  setCopyOpen(false);
                  setS(m === "varies" ? toVaries(s) : toSame(s));
                }}
              >
                {m === "same" ? t("setupGuide.editor.modeSame") : t("setupGuide.editor.modeVaries")}
              </button>
            ))}
          </div>

          <section className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">
              {varies ? t("setupGuide.editor.dayToEdit") : t("setupGuide.editor.days")}
            </span>
            <div className="flex justify-between gap-1">
              {SCHEDULE_WEEK_ORDER.map((d) => {
                const on = varies ? s.open === d : s.days[d];
                const dot = varies && periodsOf(s.perDay[d]).length > 0;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    data-testid={`schedule-day-${d}`}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-sm ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                    }`}
                    onClick={() => {
                      setAnchor(null);
                      setS(varies ? { ...s, open: d } : toggleDay(s, d));
                      setCopyOpen(false);
                    }}
                  >
                    {dayName(d)}
                    {dot && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${on ? "bg-primary-foreground" : "bg-primary"}`} />}
                  </button>
                );
              })}
            </div>
            {!varies && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" data-testid="schedule-days-all" onClick={() => setS(setDays(s, [0, 1, 2, 3, 4, 5, 6]))}>
                  {t("setupGuide.editor.all")}
                </Button>
                <Button size="sm" variant="outline" data-testid="schedule-days-weekdays" onClick={() => setS(setDays(s, [1, 2, 3, 4, 5]))}>
                  {t("setupGuide.editor.weekdays")}
                </Button>
                <Button size="sm" variant="outline" data-testid="schedule-days-weekend" onClick={() => setS(setDays(s, [6, 0]))}>
                  {t("setupGuide.editor.weekend")}
                </Button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                {varies ? t("setupGuide.editor.hoursOf", { day: dayName(s.open).toUpperCase() }) : t("setupGuide.editor.hours")}
              </span>
              {periodsOf(slots).length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="schedule-clear"
                  onClick={() => {
                    setAnchor(null);
                    setS(withSlotsInView(s, emptySlots()));
                  }}
                >
                  {t("setupGuide.editor.clear")}
                </Button>
              )}
            </div>
            <p className="text-sm" data-testid="schedule-hint" data-step={gridHint(grid)}>
              <span className="mr-2 font-semibold text-primary">{gridHint(grid)}</span>
              {t(`setupGuide.editor.hint${gridHint(grid)}`)}
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {gridHours().map((h) => {
                const cell = hourCell(grid, h);
                return (
                  <button
                    key={h}
                    type="button"
                    data-testid={`schedule-hour-${String(h).padStart(2, "0")}`}
                    data-cell={cell}
                    aria-label={`${String(h).padStart(2, "0")}:00`}
                    className={`flex h-11 flex-col items-center justify-center rounded-md text-sm tabular-nums ${CELL[cell]}`}
                    onClick={() => tapHour(h)}
                  >
                    {String(h).padStart(2, "0")}
                    {cell === "free_end" && <span className="text-[9px] font-semibold text-primary">{t("setupGuide.editor.free")}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {periodsOf(slots).length > 0 && (
            <section className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.editor.periods")}</span>
              {periodsOf(slots).map((p, i) => (
                <div key={`${p.start}-${p.end}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2" data-testid={`schedule-period-${i}`}>
                  <span className="min-w-[8rem] text-sm font-medium tabular-nums">
                    {slotLabel(p.start)} – {slotLabel(p.end)} · {periodLength(p)}
                  </span>
                  {(["start", "end"] as const).map((edge) => (
                    <span key={edge} className="flex items-center gap-1 text-xs text-muted-foreground">
                      {edge === "start" ? t("setupGuide.editor.starts") : t("setupGuide.editor.ends")}
                      <Button size="icon" variant="outline" className="h-7 w-7" data-testid={`schedule-period-${i}-${edge}-minus`}
                        onClick={() => setS(withSlotsInView(s, stepPeriod(slots, p, edge, -1)))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" data-testid={`schedule-period-${i}-${edge}-plus`}
                        onClick={() => setS(withSlotsInView(s, stepPeriod(slots, p, edge, 1)))}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </span>
                  ))}
                  <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label={t("setupGuide.editor.removePeriod")}
                    data-testid={`schedule-period-${i}-remove`}
                    onClick={() => setS(withSlotsInView(s, removePeriod(slots, p)))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </section>
          )}

          {varies && (
            <section className="flex flex-col gap-2">
              {!copyOpen ? (
                <Button size="sm" variant="outline" data-testid="schedule-copy" onClick={() => { setCopyOpen(true); setCopyTargets([]); }}>
                  {t("setupGuide.editor.copy", { day: dayName(s.open) })}
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <div className="flex flex-wrap gap-1">
                    {SCHEDULE_WEEK_ORDER.filter((d) => d !== s.open).map((d) => {
                      const on = copyTargets.includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on} data-testid={`schedule-copy-day-${d}`}
                          className={`rounded-full border px-3 py-1 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-border"}`}
                          onClick={() => setCopyTargets(on ? copyTargets.filter((x) => x !== d) : [...copyTargets, d])}>
                          {dayName(d)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setCopyOpen(false)}>{t("setupGuide.editor.cancel")}</Button>
                    <Button size="sm" data-testid="schedule-copy-do" onClick={() => { setS(copyOpenDayTo(s, copyTargets)); setCopyOpen(false); }}>
                      {t("setupGuide.editor.copyDo")}
                    </Button>
                  </div>
                </div>
              )}
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.editor.week")}</span>
              {SCHEDULE_WEEK_ORDER.map((d) => {
                const day = weekSlots(s)[d];
                return (
                  <button key={d} type="button" data-testid={`schedule-week-${d}`}
                    className={`flex items-center gap-3 rounded-md px-2 py-1 text-left text-sm ${s.open === d ? "bg-muted" : ""}`}
                    onClick={() => { setAnchor(null); setS({ ...s, open: d }); }}>
                    <span className="w-10">{dayName(d)}</span>
                    <span className="relative h-2 flex-1 rounded-full bg-muted">
                      {periodsOf(day).map((p) => (
                        <span key={p.start} className="absolute top-0 h-2 rounded-full bg-primary/60"
                          style={{ left: `${(p.start / 48) * 100}%`, width: `${((p.end - p.start) / 48) * 100}%` }} />
                      ))}
                    </span>
                    <span className="w-28 text-right tabular-nums" data-testid={`schedule-week-${d}-text`}>
                      {weekRowText(day, t("setupGuide.editor.weekFree"))}
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.editor.name")}</span>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_NAME_SUGGESTIONS.map((n) => (
                <button key={n} type="button" aria-pressed={s.name === n} data-testid={`schedule-name-${n}`}
                  className={`rounded-full px-3 py-1 text-sm ${s.name === n ? "bg-foreground text-background" : "bg-muted"}`}
                  onClick={() => setS(toggleName(s, n))}>
                  {n}
                </button>
              ))}
            </div>
          </section>

          {summary && (
            <p className="text-sm text-muted-foreground" data-testid="schedule-summary">
              {summary}
            </p>
          )}

          <div className="flex flex-col gap-2 pb-2">
            <Button disabled={!canSave(s) || saving} data-testid="schedule-save" onClick={() => onSave(s)}>
              {editing ? t("setupGuide.editor.saveEdit") : t("setupGuide.editor.saveNew")}
            </Button>
            <Button variant="ghost" data-testid="schedule-cancel" onClick={onClose}>
              {t("setupGuide.editor.cancel")}
            </Button>
            {editing && onDelete && (
              <Button variant="ghost" className="text-destructive" data-testid="schedule-delete" onClick={onDelete}>
                {t("setupGuide.editor.delete")}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
