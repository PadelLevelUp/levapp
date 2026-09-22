/**
 * settings.coach-working-hours rule 3 (PAD-357): the coach declares when they
 * work, per weekday. Seven rows; each is "não trabalho" or one or more
 * start–end windows. Until the coach saves anything (`workingHours: null`) the
 * rows show the default window as the assumption in effect. Once saved, all
 * seven days are written explicitly, so a missing key never comes from here.
 * The success notice follows the server's confirmation; a refusal names the day.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Loader2, Plus, X } from "lucide-react";
import {
  DEFAULT_WORKING_WINDOW,
  addWorkingWindow,
  snapToGrid,
  WORKING_DAY_KEYS,
  type WorkingDayKey,
} from "@levelup/config";
import { workingHoursApi } from "@levelup/api";
import type { CoachWorkingHours } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [week, setWeek] = useState<Week>(() => weekFromWorkingHours(null));
  const [errorDay, setErrorDay] = useState<WorkingDayKey | null>(null);

  const apply = (value: CoachWorkingHours) => {
    setIsSet(value !== null);
    setWeek(weekFromWorkingHours(value));
  };

  // PAD-392 (B-155): the week is loaded ONCE, and a load never replaces a week the
  // coach has touched. `t` was in this effect's deps, and `t` gets a new identity when
  // the account's language settles after a page load (i18n starts at "pt"): the effect
  // re-ran, and the second load's `apply` silently undid whatever the coach had changed
  // in the meantime. `t` and `toast` are read through refs so the effect needs neither.
  const tRef = useRef(t);
  tRef.current = t;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const touched = useRef(false);

  useEffect(() => {
    let active = true;
    workingHoursApi.getCoachWorkingHours()
      .then((res) => active && !touched.current && apply(res.workingHours))
      .catch(() => active && toastRef.current({ variant: "destructive", title: tRef.current("settings.workingHours.loadFailed") }))
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
      toast({ title: t(value === null ? "settings.workingHours.cleared" : "settings.workingHours.saved") });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { code?: string; day?: WorkingDayKey } } })?.response?.data;
      if (data?.code === "INVALID_WORKING_HOURS" && data.day && WORKING_DAY_KEYS.includes(data.day)) setErrorDay(data.day);
      toast({ variant: "destructive", title: t("settings.workingHours.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="working-hours" data-state={isSet ? "set" : "default"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          {t("settings.workingHours.title")}
        </CardTitle>
        <CardDescription>{t("settings.workingHours.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {!isSet && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" data-testid="working-hours-default-note">
                {t("settings.workingHours.defaultNote", {
                  start: DEFAULT_WORKING_WINDOW.startTime,
                  end: DEFAULT_WORKING_WINDOW.endTime,
                })}
              </p>
            )}

            <div className="space-y-3">
              {WORKING_DAY_KEYS.map((key) => {
                const row = week[key];
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
                    data-testid={`working-hours-day-${key}`}
                    data-state={row.off ? "off" : "working"}
                    data-invalid={errorDay === key ? "true" : undefined}
                  >
                    <div className="flex items-center justify-between gap-3 sm:w-44 sm:shrink-0">
                      <span className="font-medium">{t(`settings.workingHours.days.${key}`)}</span>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch
                          checked={!row.off}
                          onCheckedChange={(on) => update(key, { ...row, off: !on })}
                          aria-label={t("settings.workingHours.worksAria", { day: t(`settings.workingHours.days.${key}`) })}
                          data-testid={`working-hours-works-${key}`}
                        />
                      </label>
                    </div>
                    {row.off ? (
                      <p className="text-sm text-muted-foreground sm:pt-1.5">{t("settings.workingHours.off")}</p>
                    ) : (
                      <div className="flex flex-1 flex-col gap-2">
                        {row.windows.map((w, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              type="time"
                              step={900}
                              className="w-28"
                              value={w[0]}
                              aria-label={t("settings.workingHours.startAria")}
                              data-testid={`working-hours-${key}-${i}-start`}
                              onChange={(e) =>
                                update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) })
                              }
                              // Rule 6: step only drives the arrows, so a typed 13:07 lands here;
                              // it moves to the grid where the coach can see it, before any save.
                              onBlur={(e) => {
                                const v = snapToGrid(e.target.value);
                                if (v !== w[0]) update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [v, x[1]] : x)) });
                              }}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              step={900}
                              className="w-28"
                              value={w[1]}
                              aria-label={t("settings.workingHours.endAria")}
                              data-testid={`working-hours-${key}-${i}-end`}
                              onChange={(e) =>
                                update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [x[0], e.target.value] : x)) })
                              }
                              onBlur={(e) => {
                                const v = snapToGrid(e.target.value);
                                if (v !== w[1]) update(key, { ...row, windows: row.windows.map((x, j) => (j === i ? [x[0], v] : x)) });
                              }}
                            />
                            {row.windows.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t("settings.workingHours.removeWindow")}
                                data-testid={`working-hours-remove-${key}-${i}`}
                                onClick={() => update(key, { ...row, windows: row.windows.filter((_, j) => j !== i) })}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="self-start gap-1"
                          data-testid={`working-hours-add-${key}`}
                          disabled={addWorkingWindow(row.windows) === null}
                          onClick={() => {
                            // Rule 5: always a day the server accepts, the same on iOS.
                            const windows = addWorkingWindow(row.windows);
                            if (windows) update(key, { ...row, windows });
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t("settings.workingHours.addWindow")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {errorDay && (
              <p className="text-sm text-destructive" role="alert" data-testid="working-hours-error" data-day={errorDay}>
                {t("settings.workingHours.invalidDay", { day: t(`settings.workingHours.days.${errorDay}`) })}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {isSet && (
                <Button variant="outline" disabled={saving} onClick={() => persist(null)} data-testid="working-hours-clear">
                  {t("settings.workingHours.clear")}
                </Button>
              )}
              <Button disabled={saving} onClick={() => persist(workingHoursFromWeek(week))} data-testid="working-hours-save">
                {saving ? t("settings.workingHours.saving") : t("common.save")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
