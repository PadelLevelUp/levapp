/**
 * settings.coach-working-hours rule 3 (PAD-357), mirroring web's
 * WorkingHoursSection: the coach declares when they work, per weekday. Seven
 * rows; each is "não trabalho" or one or more start–end windows. Until the coach
 * saves anything (`workingHours: null`) the rows show the default window as the
 * assumption in effect. Once saved, all seven days are written explicitly. The
 * success notice follows the server's confirmation; a refusal names the day.
 *
 * Maestro reads no data attributes, so the states web carries in `data-state`
 * are in the ids here: `working-hours-set|default`,
 * `working-hours-day-<key>-off|working`, `working-hours-error-<key>`.
 */
import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  DEFAULT_WORKING_WINDOW,
  WORKING_DAY_KEYS,
  addWorkingWindow,
  lightTheme,
  type WorkingDayKey,
} from "@levelup/config";
import { workingHoursApi } from "@levelup/api";
import type { CoachWorkingHours } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";

type Row = { off: boolean; windows: [string, string][] };
type Week = Record<WorkingDayKey, Row>;

const defaultWindow = (): [string, string] => [DEFAULT_WORKING_WINDOW.startTime, DEFAULT_WORKING_WINDOW.endTime];

/** The editor's seven rows for a stored value (a missing day reads as the default). */
function weekFromWorkingHours(value: CoachWorkingHours): Week {
  const week = {} as Week;
  for (const key of WORKING_DAY_KEYS) {
    const stored = value?.[key];
    week[key] =
      stored === undefined
        ? { off: false, windows: [defaultWindow()] }
        : { off: stored.length === 0, windows: stored.length ? stored.map((w) => [w[0], w[1]]) : [defaultWindow()] };
  }
  return week;
}

/** All seven days, explicitly: a day off is an empty list. */
function workingHoursFromWeek(week: Week): NonNullable<CoachWorkingHours> {
  const out: NonNullable<CoachWorkingHours> = {};
  for (const key of WORKING_DAY_KEYS) out[key] = week[key].off ? [] : week[key].windows.map((w) => [w[0], w[1]]);
  return out;
}

export function WorkingHoursSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isSet, setIsSet] = React.useState(false);
  const [week, setWeek] = React.useState<Week>(() => weekFromWorkingHours(null));
  const [errorDay, setErrorDay] = React.useState<WorkingDayKey | null>(null);

  const apply = (value: CoachWorkingHours) => {
    setIsSet(value !== null);
    setWeek(weekFromWorkingHours(value));
  };

  // PAD-392 (B-155): loaded ONCE, and a load never replaces a week the coach has
  // touched. `t` was in the deps; it gets a new identity whenever the language changes
  // (at sign-in, or from the language selector in these same Settings), the effect
  // re-ran, and the reload silently undid unsaved edits. Same fix as web.
  const tRef = React.useRef(t);
  tRef.current = t;
  const touched = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    workingHoursApi
      .getCoachWorkingHours()
      .then((res) => active && !touched.current && apply(res.workingHours))
      .catch(() => active && toast.error(tRef.current("settings.workingHours.loadFailed")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const update = (key: WorkingDayKey, row: Row) => {
    touched.current = true;
    setErrorDay(null);
    setWeek((w) => ({ ...w, [key]: row }));
  };

  const persist = async (value: CoachWorkingHours) => {
    setSaving(true);
    setErrorDay(null);
    try {
      const res = await workingHoursApi.putCoachWorkingHours(value);
      apply(res.workingHours);
      touched.current = false; // what is shown is what the server holds again
      toast.success(t(value === null ? "settings.workingHours.cleared" : "settings.workingHours.saved"));
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { code?: string; day?: WorkingDayKey } } })?.response?.data;
      if (data?.code === "INVALID_WORKING_HOURS" && data.day && WORKING_DAY_KEYS.includes(data.day)) {
        setErrorDay(data.day);
      }
      toast.error(t("settings.workingHours.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card testID="working-hours">
      <CardContent className="gap-4 p-4">
        <View className="gap-1" testID={`working-hours-${isSet ? "set" : "default"}`}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={18} color={lightTheme.primary} />
            <Text className="text-base font-semibold">{t("settings.workingHours.title")}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">{t("settings.workingHours.description")}</Text>
        </View>

        {loading ? (
          <Spinner size="small" />
        ) : (
          <>
            {!isSet ? (
              <Text
                className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
                testID="working-hours-default-note"
              >
                {t("settings.workingHours.defaultNote", {
                  start: DEFAULT_WORKING_WINDOW.startTime,
                  end: DEFAULT_WORKING_WINDOW.endTime,
                })}
              </Text>
            ) : null}

            {WORKING_DAY_KEYS.map((key) => {
              const row = week[key];
              const dayName = t(`settings.workingHours.days.${key}`);
              return (
                <View
                  key={key}
                  className="gap-2 rounded-lg border border-border p-3"
                  testID={`working-hours-day-${key}-${row.off ? "off" : "working"}`}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="font-medium">{dayName}</Text>
                    <Switch
                      testID={`working-hours-works-${key}`}
                      accessibilityLabel={t("settings.workingHours.worksAria", { day: dayName })}
                      checked={!row.off}
                      onCheckedChange={(on) => update(key, { ...row, off: !on })}
                    />
                  </View>
                  {row.off ? (
                    <Text className="text-sm text-muted-foreground">{t("settings.workingHours.off")}</Text>
                  ) : (
                    <View className="gap-2">
                      {row.windows.map((w, i) => (
                        <View key={i} className="flex-row items-end gap-2">
                          <View className="flex-1">
                            <TimePickerInput
                              testID={`working-hours-${key}-${i}-start`}
                              label={t("settings.workingHours.startAria")}
                              value={w[0]}
                              onChange={(v) =>
                                update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [v, x[1]] : x)) })
                              }
                            />
                          </View>
                          <View className="flex-1">
                            <TimePickerInput
                              testID={`working-hours-${key}-${i}-end`}
                              label={t("settings.workingHours.endAria")}
                              value={w[1]}
                              onChange={(v) =>
                                update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [x[0], v] : x)) })
                              }
                            />
                          </View>
                          {row.windows.length > 1 ? (
                            <Pressable
                              testID={`working-hours-remove-${key}-${i}`}
                              role="button"
                              accessibilityLabel={t("settings.workingHours.removeWindow")}
                              hitSlop={8}
                              onPress={() => update(key, { ...row, windows: row.windows.filter((_, j) => j !== i) })}
                              className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
                            >
                              <Ionicons name="close" size={18} color={lightTheme.mutedForeground} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        testID={`working-hours-add-${key}`}
                        disabled={addWorkingWindow(row.windows) === null}
                        onPress={() => {
                          // Rule 5: always a day the server accepts, the same on web.
                          const windows = addWorkingWindow(row.windows);
                          if (windows) update(key, { ...row, windows });
                        }}
                      >
                        <Ionicons name="add" size={16} color={lightTheme.primary} />
                        <Text>{t("settings.workingHours.addWindow")}</Text>
                      </Button>
                    </View>
                  )}
                </View>
              );
            })}

            {errorDay ? (
              <Text
                className="text-sm text-destructive"
                accessibilityRole="alert"
                testID={`working-hours-error-${errorDay}`}
              >
                {t("settings.workingHours.invalidDay", { day: t(`settings.workingHours.days.${errorDay}`) })}
              </Text>
            ) : null}

            <View className="gap-2">
              <Button testID="working-hours-save" disabled={saving} onPress={() => void persist(workingHoursFromWeek(week))}>
                {saving ? <Spinner size="small" color="white" /> : null}
                <Text>{saving ? t("settings.workingHours.saving") : t("common.save")}</Text>
              </Button>
              {isSet ? (
                <Button
                  variant="outline"
                  testID="working-hours-clear"
                  disabled={saving}
                  onPress={() => void persist(null)}
                >
                  <Text>{t("settings.workingHours.clear")}</Text>
                </Button>
              ) : null}
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
