/**
 * PAD-839 (dashboard.student-setup-guide rule 9): the schedule editor on iOS/Android, the twin of
 * web's `components/setup-guide/ScheduleEditor.tsx` with the same test ids. Every rule it follows
 * lives in `@levelup/config/availability-schedule`; this file only draws the state and forwards
 * taps.
 *
 * A native Modal (a page sheet on iOS, a full-screen slide on Android, where back closes it), as
 * the blocker sheet is. Inside it every selected or state-dependent visual is driven by `style`,
 * never by swapping classes (rn-code: a class swap inside a native Modal once crashed the blocker
 * sheet). Each grid cell exposes its state as `accessibilityValue.text` (web's `data-cell`), and
 * the hint its step number the same way (web's `data-step`).
 */
import { Ionicons } from "@expo/vector-icons";
import {
  SCHEDULE_GRID_COLUMNS,
  SCHEDULE_NAME_SUGGESTIONS,
  SCHEDULE_WEEK_ORDER,
  canSave,
  copyOpenDayTo,
  emptySlots,
  gridHint,
  gridHours,
  gridTap,
  hourCell,
  lightTheme,
  lightThemeHsl,
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
  type HourCell,
  type Schedule,
} from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, ScrollView, View, type ViewStyle } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** The brand blue at `alpha`, for the tinted cells. */
function blue(alpha: number): string {
  const [h, s, l] = lightThemeHsl.primary.split(" ");
  return `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

const CELL: Record<HourCell, ViewStyle> = {
  busy: { backgroundColor: blue(0.12), borderWidth: 1, borderColor: blue(0.4) },
  half: { backgroundColor: blue(0.05), borderWidth: 1, borderStyle: "dashed", borderColor: blue(0.4) },
  free_end: { backgroundColor: lightTheme.card, borderWidth: 1, borderStyle: "dashed", borderColor: blue(0.4) },
  anchor: { backgroundColor: lightTheme.card, borderWidth: 2, borderColor: lightTheme.primary },
  free: { backgroundColor: lightTheme.card, borderWidth: 1, borderColor: lightTheme.border },
};

const pad = (h: number) => String(h).padStart(2, "0");

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function StepButton({ testID, icon, onPress }: { testID: string; icon: "remove" | "add"; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      role="button"
      onPress={onPress}
      style={{ height: 30, width: 30, borderRadius: 6, borderWidth: 1, borderColor: lightTheme.border, alignItems: "center", justifyContent: "center", backgroundColor: lightTheme.card }}
    >
      <Ionicons name={icon} size={14} color={lightTheme.foreground} />
    </Pressable>
  );
}

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
  const [s, setS] = React.useState<Schedule>(initial);
  const [anchor, setAnchor] = React.useState<number | null>(null);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copyTargets, setCopyTargets] = React.useState<number[]>([]);
  const [seed, setSeed] = React.useState(initial);
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
  const periods = periodsOf(slots);
  const hint = gridHint(grid);
  const hours = gridHours();
  const rows: number[][] = [];
  for (let i = 0; i < hours.length; i += SCHEDULE_GRID_COLUMNS) rows.push(hours.slice(i, i + SCHEDULE_GRID_COLUMNS));

  const tapHour = (h: number) => {
    const next = gridTap(grid, h);
    setAnchor(next.anchor);
    setS(withSlotsInView(s, next.slots));
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
      onRequestClose={onClose}
    >
      <ScrollView testID="schedule-editor" className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-10">
        <Text className="font-display text-xl">{editing ? t("setupGuide.editor.titleEdit") : t("setupGuide.editor.titleNew")}</Text>

        <View style={{ flexDirection: "row", borderRadius: 8, backgroundColor: lightTheme.muted, padding: 4 }} role="radiogroup">
          {(["same", "varies"] as const).map((m) => {
            const on = s.mode === m;
            return (
              <Pressable
                key={m}
                role="radio"
                accessibilityState={{ checked: on }}
                testID={`schedule-mode-${m}`}
                style={{ flex: 1, borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: on ? lightTheme.card : "transparent" }}
                onPress={() => {
                  setAnchor(null);
                  setCopyOpen(false);
                  setS(m === "varies" ? toVaries(s) : toSame(s));
                }}
              >
                <Text style={{ color: on ? lightTheme.foreground : lightTheme.mutedForeground }} className="text-sm">
                  {m === "same" ? t("setupGuide.editor.modeSame") : t("setupGuide.editor.modeVaries")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Section title={varies ? t("setupGuide.editor.dayToEdit") : t("setupGuide.editor.days")}>
          <View className="flex-row justify-between">
            {SCHEDULE_WEEK_ORDER.map((d) => {
              const on = varies ? s.open === d : s.days[d];
              const dot = varies && periodsOf(s.perDay[d]).length > 0;
              return (
                <Pressable
                  key={d}
                  role="button"
                  accessibilityState={{ selected: on }}
                  testID={`schedule-day-${d}`}
                  style={{
                    height: 40,
                    width: 40,
                    borderRadius: 20,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: on ? lightTheme.primary : lightTheme.border,
                    backgroundColor: on ? lightTheme.primary : lightTheme.card,
                  }}
                  onPress={() => {
                    setAnchor(null);
                    setS(varies ? { ...s, open: d } : toggleDay(s, d));
                    setCopyOpen(false);
                  }}
                >
                  <Text className="text-xs" style={{ color: on ? lightTheme.primaryForeground : lightTheme.foreground }}>
                    {dayName(d)}
                  </Text>
                  {dot ? (
                    <View
                      style={{ position: "absolute", bottom: 4, height: 4, width: 4, borderRadius: 2, backgroundColor: on ? lightTheme.primaryForeground : lightTheme.primary }}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {!varies ? (
            <View className="flex-row gap-2">
              <Button size="sm" variant="outline" testID="schedule-days-all" onPress={() => setS(setDays(s, [0, 1, 2, 3, 4, 5, 6]))}>
                <Text>{t("setupGuide.editor.all")}</Text>
              </Button>
              <Button size="sm" variant="outline" testID="schedule-days-weekdays" onPress={() => setS(setDays(s, [1, 2, 3, 4, 5]))}>
                <Text>{t("setupGuide.editor.weekdays")}</Text>
              </Button>
              <Button size="sm" variant="outline" testID="schedule-days-weekend" onPress={() => setS(setDays(s, [6, 0]))}>
                <Text>{t("setupGuide.editor.weekend")}</Text>
              </Button>
            </View>
          ) : null}
        </Section>

        <Section
          title={varies ? t("setupGuide.editor.hoursOf", { day: dayName(s.open).toUpperCase() }) : t("setupGuide.editor.hours")}
          right={
            periods.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                testID="schedule-clear"
                onPress={() => {
                  setAnchor(null);
                  setS(withSlotsInView(s, emptySlots()));
                }}
              >
                <Text>{t("setupGuide.editor.clear")}</Text>
              </Button>
            ) : null
          }
        >
          <View testID="schedule-hint" accessibilityValue={{ text: String(hint) }} className="flex-row gap-2">
            <Text className="text-sm font-sans-semibold text-primary">{String(hint)}</Text>
            <Text className="flex-1 text-sm">{t(`setupGuide.editor.hint${hint}`)}</Text>
          </View>
          <View className="gap-1.5">
            {rows.map((row) => (
              <View key={row[0]} className="flex-row gap-1.5">
                {row.map((h) => {
                  const cell = hourCell(grid, h);
                  return (
                    <Pressable
                      key={h}
                      role="button"
                      testID={`schedule-hour-${pad(h)}`}
                      accessibilityLabel={`${pad(h)}:00`}
                      accessibilityValue={{ text: cell }}
                      onPress={() => tapHour(h)}
                      style={[{ flex: 1, height: 44, borderRadius: 6, alignItems: "center", justifyContent: "center", overflow: "hidden" }, CELL[cell]]}
                    >
                      {cell === "free_end" ? (
                        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: blue(0.4) }} />
                      ) : null}
                      <Text className="text-sm" style={{ color: cell === "free" ? lightTheme.foreground : lightTheme.primary }}>
                        {pad(h)}
                      </Text>
                      {cell === "free_end" ? (
                        <Text style={{ fontSize: 9, color: lightTheme.primary }}>{t("setupGuide.editor.free")}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Section>

        {periods.length > 0 ? (
          <Section title={t("setupGuide.editor.periods")}>
            {periods.map((p, i) => (
              <View key={`${p.start}-${p.end}`} testID={`schedule-period-${i}`} className="gap-2 rounded-lg border border-border bg-card p-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium">{`${slotLabel(p.start)} – ${slotLabel(p.end)} · ${periodLength(p)}`}</Text>
                  <Pressable
                    role="button"
                    accessibilityLabel={t("setupGuide.editor.removePeriod")}
                    testID={`schedule-period-${i}-remove`}
                    onPress={() => setS(withSlotsInView(s, removePeriod(slots, p)))}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={16} color={lightTheme.mutedForeground} />
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-4">
                  {(["start", "end"] as const).map((edge) => (
                    <View key={edge} className="flex-row items-center gap-1">
                      <Text className="text-xs text-muted-foreground">
                        {edge === "start" ? t("setupGuide.editor.starts") : t("setupGuide.editor.ends")}
                      </Text>
                      <StepButton
                        testID={`schedule-period-${i}-${edge}-minus`}
                        icon="remove"
                        onPress={() => setS(withSlotsInView(s, stepPeriod(slots, p, edge, -1)))}
                      />
                      <StepButton
                        testID={`schedule-period-${i}-${edge}-plus`}
                        icon="add"
                        onPress={() => setS(withSlotsInView(s, stepPeriod(slots, p, edge, 1)))}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {varies ? (
          <View className="gap-2">
            {!copyOpen ? (
              <Button
                size="sm"
                variant="outline"
                testID="schedule-copy"
                onPress={() => {
                  setCopyOpen(true);
                  setCopyTargets([]);
                }}
              >
                <Text>{t("setupGuide.editor.copy", { day: dayName(s.open) })}</Text>
              </Button>
            ) : (
              <View className="gap-2 rounded-lg border border-border bg-card p-2">
                <View className="flex-row flex-wrap gap-1">
                  {SCHEDULE_WEEK_ORDER.filter((d) => d !== s.open).map((d) => {
                    const on = copyTargets.includes(d);
                    return (
                      <Pressable
                        key={d}
                        role="button"
                        accessibilityState={{ selected: on }}
                        testID={`schedule-copy-day-${d}`}
                        onPress={() => setCopyTargets(on ? copyTargets.filter((x) => x !== d) : [...copyTargets, d])}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                          borderColor: on ? lightTheme.foreground : lightTheme.border,
                          backgroundColor: on ? lightTheme.foreground : lightTheme.card,
                        }}
                      >
                        <Text className="text-sm" style={{ color: on ? lightTheme.card : lightTheme.foreground }}>
                          {dayName(d)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View className="flex-row gap-2">
                  <Button size="sm" variant="ghost" testID="schedule-copy-cancel" onPress={() => setCopyOpen(false)}>
                    <Text>{t("setupGuide.editor.cancel")}</Text>
                  </Button>
                  <Button
                    size="sm"
                    testID="schedule-copy-do"
                    onPress={() => {
                      setS(copyOpenDayTo(s, copyTargets));
                      setCopyOpen(false);
                    }}
                  >
                    <Text>{t("setupGuide.editor.copyDo")}</Text>
                  </Button>
                </View>
              </View>
            )}
            <Section title={t("setupGuide.editor.week")}>
              {SCHEDULE_WEEK_ORDER.map((d) => {
                const day = weekSlots(s)[d];
                return (
                  <Pressable
                    key={d}
                    role="button"
                    testID={`schedule-week-${d}`}
                    onPress={() => {
                      setAnchor(null);
                      setS({ ...s, open: d });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: s.open === d ? lightTheme.muted : "transparent",
                    }}
                  >
                    <Text className="w-10 text-sm">{dayName(d)}</Text>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: lightTheme.muted, overflow: "hidden" }}>
                      {periodsOf(day).map((p) => (
                        <View
                          key={p.start}
                          style={{
                            position: "absolute",
                            top: 0,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: blue(0.6),
                            left: `${(p.start / 48) * 100}%`,
                            width: `${((p.end - p.start) / 48) * 100}%`,
                          }}
                        />
                      ))}
                    </View>
                    <Text className="w-28 text-right text-sm" testID={`schedule-week-${d}-text`}>
                      {weekRowText(day, t("setupGuide.editor.weekFree"))}
                    </Text>
                  </Pressable>
                );
              })}
            </Section>
          </View>
        ) : null}

        <Section title={t("setupGuide.editor.name")}>
          <View className="flex-row flex-wrap gap-2">
            {SCHEDULE_NAME_SUGGESTIONS.map((n) => {
              const on = s.name === n;
              return (
                <Pressable
                  key={n}
                  role="button"
                  accessibilityState={{ selected: on }}
                  testID={`schedule-name-${n}`}
                  onPress={() => setS(toggleName(s, n))}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    backgroundColor: on ? lightTheme.foreground : lightTheme.muted,
                  }}
                >
                  <Text className="text-sm" style={{ color: on ? lightTheme.card : lightTheme.foreground }}>
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {summary ? (
          <Text className="text-sm text-muted-foreground" testID="schedule-summary">
            {summary}
          </Text>
        ) : null}

        <View className="gap-2">
          {/* PAD-772 (calendar.student-blockers rule 26) */}
          <Text className="text-sm text-muted-foreground" testID="schedule-covered-notice">
            {t("availability.covered.notice")}
          </Text>
          <Button disabled={!canSave(s) || Boolean(saving)} testID="schedule-save" onPress={() => onSave(s)}>
            <Text>{editing ? t("setupGuide.editor.saveEdit") : t("setupGuide.editor.saveNew")}</Text>
          </Button>
          <Button variant="ghost" testID="schedule-cancel" onPress={onClose}>
            <Text>{t("setupGuide.editor.cancel")}</Text>
          </Button>
          {editing && onDelete ? (
            <Button variant="ghost" testID="schedule-delete" onPress={onDelete}>
              <Text className="text-destructive">{t("setupGuide.editor.delete")}</Text>
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}
