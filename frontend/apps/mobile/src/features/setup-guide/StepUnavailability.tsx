/**
 * PAD-839 (dashboard.student-setup-guide rules 8, 10, 18): step 3 on iOS/Android, the twin of web's
 * `components/setup-guide/StepUnavailability.tsx`. The presets save in one tap; "Editar" and
 * "+ Criar o meu horário" open the schedule editor; a saved schedule shows its end and
 * "Prolongar"; "Estou sempre disponível" finishes the step with no block.
 */
import { Ionicons } from "@expo/vector-icons";
import {
  SCHEDULE_PRESETS,
  blockersToSchedule,
  clubTodayISO,
  emptySchedule,
  lightTheme,
  newScheduleEnd,
  newScheduleId,
  periodsOf,
  presetSchedule,
  prolongedEnd,
  rowsWithEnd,
  savedSchedules,
  scheduleCardText,
  scheduleDaysText,
  scheduleEnd,
  scheduleEndState,
  scheduleToBlockerInputs,
  slotLabel,
  type Schedule,
  type SchedulePreset,
} from "@levelup/config";
import { useAvailabilityBlockers, useDeleteSchedule, useSaveSchedule } from "@levelup/hooks";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import * as availabilityApi from "@levelup/api/src/resources/availability";
import { ScheduleEditor } from "@/features/availability/ScheduleEditor";
import { LeaveButton } from "./steps";
import type { SetupGuide } from "./useSetupGuide";

type Selection = { kind: "preset"; key: SchedulePreset["key"] } | { kind: "saved" } | null;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function StepUnavailability({ guide, onDone, onLeave }: { guide: SetupGuide; onDone: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const blockers = useAvailabilityBlockers();
  const save = useSaveSchedule();
  const remove = useDeleteSchedule();
  const today = clubTodayISO();
  const saved = React.useMemo(() => savedSchedules(blockers.data ?? [])[0] ?? null, [blockers.data]);
  const [selection, setSelection] = React.useState<Selection>(null);
  const selected: Selection = selection ?? (saved ? { kind: "saved" } : null);
  const [editor, setEditor] = React.useState<{ initial: Schedule; editing: boolean } | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const end = saved ? scheduleEnd(saved.rows) : null;

  /**
   * One schedule save (calendar.student-blockers rules 19, 21, 26): only the PUT. The server marks the classes
   * the rows newly cover; the hook re-reads the calendar and dashboard after every save, and nothing is asked.
   */
  const saveSchedule = (scheduleId: string, data: availabilityApi.ScheduleInput) => save.mutateAsync({ scheduleId, data });

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

  const alwaysAvailable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await guide.write({ alwaysAvailable: true });
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const preview = (s: Schedule) => {
    const p = periodsOf(s.shared)[0];
    return [s.name, t("setupGuide.unavailability.recurring"), scheduleDaysText(s), p ? `${slotLabel(p.start)} – ${slotLabel(p.end)}` : ""]
      .filter(Boolean)
      .join(" · ");
  };
  const presetSelected = selected?.kind === "preset" ? presetSchedule(selected.key) : null;
  const endState = end ? scheduleEndState(end, today) : null;

  return (
    <View className="gap-4" testID="setup-unavailability">
      <Text className="font-display text-2xl">{t("setupGuide.unavailability.title")}</Text>
      <Text className="text-sm text-muted-foreground">{t("setupGuide.unavailability.body")}</Text>

      {saved ? (
        <Pressable
          testID="setup-saved-schedule"
          role="button"
          accessibilityState={{ selected: selected?.kind === "saved" }}
          onPress={() => setSelection({ kind: "saved" })}
          style={{
            gap: 4,
            borderRadius: 8,
            borderWidth: 1,
            padding: 12,
            backgroundColor: lightTheme.card,
            borderColor: selected?.kind === "saved" ? lightTheme.primary : lightTheme.border,
          }}
        >
          <Text className="text-sm font-medium">{saved.rows[0]?.title ?? t("setupGuide.editor.titleNew")}</Text>
          {/* Criterion 31: its hours in either mode ("Varia" lists each day), never "Livre" for a day with hours. */}
          <Text className="text-xs text-muted-foreground" testID="setup-saved-schedule-text">
            {scheduleCardText(blockersToSchedule(saved.rows), t("setupGuide.editor.weekFree"))}
          </Text>
          {end && endState ? (
            <Text className="text-xs" testID="setup-schedule-end" accessibilityValue={{ text: endState }}>
              {endState === "ends"
                ? t("setupGuide.unavailability.ends", { date: formatDate(end) })
                : t("setupGuide.unavailability.ended", { date: formatDate(end) })}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" testID="setup-schedule-extend" disabled={save.isPending} onPress={() => void extend()}>
              <Text>{t("setupGuide.unavailability.extend")}</Text>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              testID="setup-schedule-edit"
              onPress={() => setEditor({ initial: blockersToSchedule(saved.rows), editing: true })}
            >
              <Text>{t("setupGuide.unavailability.edit")}</Text>
            </Button>
          </View>
        </Pressable>
      ) : null}

      {SCHEDULE_PRESETS.map((p) => {
        const on = selected?.kind === "preset" && selected.key === p.key;
        return (
          <Pressable
            key={p.key}
            testID={`setup-preset-${p.key}`}
            role="button"
            accessibilityState={{ selected: on }}
            onPress={() => setSelection({ kind: "preset", key: p.key })}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: 8,
              borderWidth: 1,
              padding: 12,
              backgroundColor: lightTheme.card,
              borderColor: on ? lightTheme.primary : lightTheme.border,
            }}
          >
            <View className="flex-1">
              <Text className="text-sm font-medium">{t(`setupGuide.unavailability.presets.${p.key}.label`)}</Text>
              <Text className="text-xs text-muted-foreground">{t(`setupGuide.unavailability.presets.${p.key}.detail`)}</Text>
            </View>
            {on ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  testID={`setup-preset-${p.key}-edit`}
                  onPress={() => setEditor({ initial: presetSchedule(p.key), editing: false })}
                >
                  <Text>{t("setupGuide.unavailability.edit")}</Text>
                </Button>
                <Ionicons name="checkmark" size={16} color={lightTheme.primary} />
              </>
            ) : null}
          </Pressable>
        );
      })}

      <Button variant="outline" testID="setup-schedule-create" onPress={() => setEditor({ initial: emptySchedule(), editing: false })}>
        <Text>{t("setupGuide.unavailability.create")}</Text>
      </Button>

      {presetSelected ? (
        <View className="gap-1 rounded-lg bg-muted p-3" testID="setup-schedule-preview">
          <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">{t("setupGuide.unavailability.willSave")}</Text>
          <Text className="text-xs">{preview(presetSelected)}</Text>
        </View>
      ) : null}

      {failed ? (
        <Text className="text-sm text-destructive" role="alert" testID="setup-unavailability-failed">
          {t("setupGuide.unavailability.failed")}
        </Text>
      ) : null}
      {/* PAD-772 (calendar.student-blockers rule 26): nothing is asked, so the step says what saving does. */}
      <Text className="text-sm text-muted-foreground" testID="blocker-covered-notice">
        {t("availability.covered.notice")}
      </Text>
      <Button disabled={!selected || save.isPending} onPress={() => void saveAndContinue()} testID="setup-unavailability-save">
        <Text>{t("setupGuide.unavailability.save")}</Text>
      </Button>
      <Button variant="ghost" disabled={busy} testID="setup-always-available" onPress={() => void alwaysAvailable()}>
        <Text>{t("setupGuide.unavailability.alwaysAvailable")}</Text>
      </Button>
      <LeaveButton onLeave={onLeave} label={t("setupGuide.step.later")} />

      {editor ? (
        <ScheduleEditor
          open
          initial={editor.initial}
          editing={editor.editing}
          saving={save.isPending}
          onSave={(s) => void onEditorSave(s)}
          onDelete={() => void onEditorDelete()}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </View>
  );
}
