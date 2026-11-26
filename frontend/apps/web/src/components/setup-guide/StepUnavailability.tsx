/**
 * PAD-839 (dashboard.student-setup-guide rules 8, 10, 18): step 3 on web. The presets save in one
 * tap; "Editar" and "+ Criar o meu horário" open the schedule editor; a saved schedule shows its end
 * and "Prolongar"; "Estou sempre disponível" finishes the step with no block.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  SCHEDULE_PRESETS,
  blockersToSchedule,
  clubTodayISO,
  emptySchedule,
  newScheduleEnd,
  newScheduleId,
  periodsOf,
  presetSchedule,
  prolongedEnd,
  rowsWithEnd,
  savedSchedules,
  scheduleDaysText,
  scheduleEnd,
  scheduleEndState,
  scheduleToBlockerInputs,
  slotLabel,
  scheduleCardText,
  type Schedule,
  type SchedulePreset,
} from "@levelup/config";
import { useAvailabilityBlockers, useDeleteSchedule, useSaveSchedule } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { useBlockerCoveredFollowUp } from "@/components/availability/BlockerCoveredDialog";
import { readScheduleCoveredClasses, type ScheduleInput } from "@/api/availability";
import { ScheduleEditor } from "./ScheduleEditor";
import type { SetupGuide } from "./useSetupGuide";

type Selection = { kind: "preset"; key: SchedulePreset["key"] } | { kind: "saved" } | null;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function StepUnavailability({
  guide,
  onDone,
  onLeave,
}: {
  guide: SetupGuide;
  onDone: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const blockers = useAvailabilityBlockers();
  const save = useSaveSchedule();
  // PAD-772 (calendar.student-blockers rules 19, 21): the question after a schedule save that covers classes.
  const covered = useBlockerCoveredFollowUp();
  const remove = useDeleteSchedule();
  const today = clubTodayISO();
  const saved = useMemo(() => savedSchedules(blockers.data ?? [])[0] ?? null, [blockers.data]);
  const [selection, setSelection] = useState<Selection>(null);
  const selected: Selection = selection ?? (saved ? { kind: "saved" } : null);
  const [editor, setEditor] = useState<{ initial: Schedule; editing: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const end = saved ? scheduleEnd(saved.rows) : null;

  /**
   * One schedule save. The classes it would newly cover are read first (the PUT answers a bare list); a
   * failed read saves without asking. The question follows the PUT and is answered before the caller moves on.
   */
  const saveSchedule = async (scheduleId: string, data: ScheduleInput) => {
    let coveredClasses: unknown[] = [];
    try {
      coveredClasses = await readScheduleCoveredClasses(scheduleId, data);
    } catch {
      // No warning, like the failed conflict check: the schedule still saves.
    }
    await save.mutateAsync({ scheduleId, data });
    await covered.follow({ coveredClasses });
  };

  const write = async (scheduleId: string, schedule: Schedule, endDate: string) => {
    setFailed(false);
    try {
      await saveSchedule(scheduleId, {
        title: schedule.name,
        blockers: scheduleToBlockerInputs(schedule, { startDate: today, endDate }),
      });
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  const saveAndContinue = async () => {
    if (selected?.kind === "preset") {
      if (await write(newScheduleId(), presetSchedule(selected.key), newScheduleEnd(today))) onDone();
    } else if (selected?.kind === "saved") {
      onDone();
    }
  };

  const extend = async () => {
    if (!saved) return;
    setFailed(false);
    try {
      await saveSchedule(saved.scheduleId, {
        title: saved.rows[0]?.title ?? null,
        blockers: rowsWithEnd(saved.rows, prolongedEnd(end, today)),
      });
    } catch {
      setFailed(true);
    }
  };

  const onEditorSave = async (schedule: Schedule) => {
    const editingSaved = editor?.editing && saved;
    const id = editingSaved ? saved.scheduleId : newScheduleId();
    const endDate = editingSaved && end && end >= today ? end : newScheduleEnd(today);
    if (await write(id, schedule, endDate)) {
      setEditor(null);
      setSelection({ kind: "saved" });
    }
  };

  const onEditorDelete = async () => {
    if (!saved) return;
    try {
      await remove.mutateAsync(saved.scheduleId);
      setEditor(null);
      setSelection(null);
    } catch {
      setFailed(true);
    }
  };

  const preview = (s: Schedule) => {
    const p = periodsOf(s.shared)[0];
    return [
      s.name,
      t("setupGuide.unavailability.recurring"),
      scheduleDaysText(s),
      p ? `${slotLabel(p.start)} – ${slotLabel(p.end)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const selectedSchedule =
    selected?.kind === "preset" ? presetSchedule(selected.key) : selected?.kind === "saved" && saved ? blockersToSchedule(saved.rows) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="setup-unavailability">
      {covered.dialog}
      <h1 className="font-display text-2xl font-bold">{t("setupGuide.unavailability.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("setupGuide.unavailability.body")}</p>

      {saved && (
        <div
          className={`flex flex-col gap-1 rounded-lg border p-3 ${selected?.kind === "saved" ? "border-primary" : "border-border"}`}
          data-testid="setup-saved-schedule"
          role="button"
          tabIndex={0}
          onClick={() => setSelection({ kind: "saved" })}
        >
          <span className="text-sm font-medium">{saved.rows[0]?.title ?? t("setupGuide.editor.titleNew")}</span>
          <span className="text-xs text-muted-foreground">
            {scheduleCardText(blockersToSchedule(saved.rows), t("setupGuide.editor.weekFree"))}
          </span>
          {end && (
            <span className="text-xs" data-testid="setup-schedule-end" data-state={scheduleEndState(end, today)}>
              {scheduleEndState(end, today) === "ends"
                ? t("setupGuide.unavailability.ends", { date: formatDate(end) })
                : t("setupGuide.unavailability.ended", { date: formatDate(end) })}
            </span>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" data-testid="setup-schedule-extend" disabled={save.isPending}
              onClick={(e) => { e.stopPropagation(); void extend(); }}>
              {t("setupGuide.unavailability.extend")}
            </Button>
            <Button size="sm" variant="ghost" data-testid="setup-schedule-edit"
              onClick={(e) => { e.stopPropagation(); setEditor({ initial: blockersToSchedule(saved.rows), editing: true }); }}>
              {t("setupGuide.unavailability.edit")}
            </Button>
          </div>
        </div>
      )}

      {SCHEDULE_PRESETS.map((p) => {
        const on = selected?.kind === "preset" && selected.key === p.key;
        return (
          <div key={p.key} className={`flex items-center gap-3 rounded-lg border p-3 ${on ? "border-primary" : "border-border"}`}
            data-testid={`setup-preset-${p.key}`} role="button" tabIndex={0} aria-pressed={on}
            onClick={() => setSelection({ kind: "preset", key: p.key })}>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{t(`setupGuide.unavailability.presets.${p.key}.label`)}</span>
              <span className="text-xs text-muted-foreground">{t(`setupGuide.unavailability.presets.${p.key}.detail`)}</span>
            </span>
            {on && (
              <>
                <Button size="sm" variant="ghost" data-testid={`setup-preset-${p.key}-edit`}
                  onClick={(e) => { e.stopPropagation(); setEditor({ initial: presetSchedule(p.key), editing: false }); }}>
                  {t("setupGuide.unavailability.edit")}
                </Button>
                <Check className="h-4 w-4 text-primary" />
              </>
            )}
          </div>
        );
      })}

      <Button variant="outline" data-testid="setup-schedule-create" onClick={() => setEditor({ initial: emptySchedule(), editing: false })}>
        {t("setupGuide.unavailability.create")}
      </Button>

      {selectedSchedule && selected?.kind === "preset" && (
        <div className="rounded-lg bg-muted p-3 text-xs" data-testid="setup-schedule-preview">
          <div className="font-semibold tracking-wide text-muted-foreground">{t("setupGuide.unavailability.willSave")}</div>
          <div>{preview(selectedSchedule)}</div>
        </div>
      )}

      {failed && (
        <p className="text-sm text-destructive" role="alert">
          {t("setupGuide.unavailability.failed")}
        </p>
      )}
      <Button disabled={!selected || save.isPending} onClick={() => void saveAndContinue()} data-testid="setup-unavailability-save">
        {t("setupGuide.unavailability.save")}
      </Button>
      <Button
        variant="ghost"
        data-testid="setup-always-available"
        onClick={async () => {
          setFailed(false);
          try {
            await guide.write({ alwaysAvailable: true });
            onDone();
          } catch {
            setFailed(true);
          }
        }}
      >
        {t("setupGuide.unavailability.alwaysAvailable")}
      </Button>
      <Button variant="ghost" onClick={onLeave} data-testid="setup-step-later">
        {t("setupGuide.step.later")}
      </Button>

      {editor && (
        <ScheduleEditor
          open
          initial={editor.initial}
          editing={editor.editing}
          saving={save.isPending}
          onSave={(s) => void onEditorSave(s)}
          onDelete={() => void onEditorDelete()}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
