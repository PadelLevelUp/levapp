/**
 * PAD-357 (classes.class-requests rules 12–14, classes.availability): the
 * private-class step. Nº de pessoas 1–4 with "Quem vai contigo" usernames
 * (each checked against the coach's roster, one code, no oracle), single or
 * weekly recurrence, duration, the free start times everyone shares, an
 * optional note, send. Free time comes from the server as `freeWindows` and is
 * rendered only through @levelup/config's availability module.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  CLASS_REQUEST_DURATIONS,
  FIRST_FREE_DAY_HORIZON_DAYS,
  clubTodayISO,
  firstFreeDay,
  occurrenceDates,
  slotStarts,
  weeklyIntersection,
  type Window,
} from "@levelup/config";
import { queryKeys } from "@levelup/hooks";
import type { AvailabilityResponse, ParticipantCheck } from "@levelup/types";
import { requestAvailabilityApi } from "@levelup/api";
import { classRequestRefusal, createClassRequest } from "@/api/classRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const MAX_PEOPLE = 4;
// Monday-first, the recurrence's own convention (1 = Monday … 7 = Sunday).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** The refusal code of a failed check, or null for an accepted one. */
function checkCode(c: ParticipantCheck | undefined): string | null {
  return c && "code" in c ? c.code : null;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

type Recurring = "single" | "weekly";

export function PrivateClassStep({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = clubTodayISO();

  // ── People ──
  const [people, setPeople] = useState(1);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, ParticipantCheck>>({});

  // ── Recurrence ──
  const [recurring, setRecurring] = useState<Recurring>("single");
  const [date, setDate] = useState(today);
  const dateTouched = useRef(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysIso(today, 28));

  // ── Slot ──
  const [duration, setDuration] = useState<number>(60);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Window | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const invitees = usernames.slice(0, people - 1).map((u) => u.trim()).filter(Boolean);
  const inviteesKey = invitees.join(",");
  const allInviteesOk = invitees.length === people - 1 && invitees.every((u) => checks[u]?.ok === true);

  // Keep one username field per invitee.
  useEffect(() => {
    setUsernames((u) => Array.from({ length: people - 1 }, (_, i) => u[i] ?? ""));
  }, [people]);

  // Rule 12: each username checked against this coach's roster (debounced).
  useEffect(() => {
    const pending = invitees.filter((u) => !checks[u]);
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      requestAvailabilityApi.getRequestParticipants(coachId, pending)
        .then((rows) => setChecks((c) => ({ ...c, ...Object.fromEntries(rows.map((r) => [r.username, r])) })))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey]);

  const recurrence = recurring === "weekly" ? { weekdays: [...weekdays].sort(), startDate, endDate } : null;
  const recurrenceValid = !recurrence || (weekdays.length > 0 && startDate <= endDate && occurrenceDates(recurrence).length > 0);

  // Rules 11 + 13: for a single class open on the first day that still has free time.
  useEffect(() => {
    if (recurring !== "single" || dateTouched.current || !allInviteesOk) return;
    let active = true;
    requestAvailabilityApi.getCoachAvailability({ coachId, from: today, to: addDaysIso(today, FIRST_FREE_DAY_HORIZON_DAYS), participants: invitees })
      .then((res) => {
        if (!active) return;
        const days = Object.entries(res.freeWindows)
          .filter(([, windows]) => slotStarts(windows, duration).length > 0)
          .map(([d]) => ({ date: d }));
        setDate(firstFreeDay(days, today));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, recurring, inviteesKey, allInviteesOk]);

  // Rule 13: everyone's free windows for the chosen day or recurrence range.
  useEffect(() => {
    setSlot(null);
    if (!allInviteesOk || !recurrenceValid) {
      setAvailability(null);
      return;
    }
    const from = recurrence ? startDate : date;
    const to = recurrence ? endDate : date;
    if (!from || !to) return;
    let active = true;
    setLoadingSlots(true);
    requestAvailabilityApi.getCoachAvailability({ coachId, from, to, participants: invitees })
      .then((res) => active && setAvailability(res))
      .catch(() => active && setAvailability(null))
      .finally(() => active && setLoadingSlots(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey, allInviteesOk, recurring, date, startDate, endDate, weekdays.join(","), recurrenceValid]);

  const starts = useMemo(() => {
    if (!availability) return [];
    if (recurrence) return slotStarts(weeklyIntersection(availability.freeWindows, recurrence).windows, duration);
    return slotStarts(availability.freeWindows[date] ?? [], duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, duration, date, recurring, weekdays.join(","), startDate, endDate]);

  const send = async () => {
    if (!slot) return;
    setSending(true);
    try {
      await createClassRequest({
        coachId,
        date: recurrence ? occurrenceDates(recurrence)[0] : date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: note.trim() || null,
        participants: invitees.length ? invitees : undefined,
        recurrence: recurrence ?? undefined,
      });
      toast({ title: t("classRequests.sent"), description: t("classRequests.sentBody") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.classRequests });
      onDone();
    } catch (err) {
      const refusal = classRequestRefusal(err);
      toast({
        variant: "destructive",
        title: t("classRequests.failed"),
        description: refusal ? t(`classRequestWizard.refusal.${refusal.code}`, { defaultValue: t(`classRequests.refusal.${refusal.code}`, { defaultValue: "" }) }) || undefined : undefined,
      });
      setSlot(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="wizard-private">
      {/* Nº de pessoas + Quem vai contigo (rule 12) */}
      <div className="space-y-2">
        <Label>{t("classRequestWizard.people")}</Label>
        <div className="flex gap-1" role="group">
          {Array.from({ length: MAX_PEOPLE }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={people === n}
              data-testid={`wizard-people-${n}`}
              onClick={() => setPeople(n)}
              className={cn(
                "h-9 w-9 rounded-full text-sm font-medium transition-colors",
                people === n ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted-foreground/10"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {people > 1 && (
          <div className="space-y-2 rounded-lg border p-3" data-testid="wizard-invitees">
            <Label>{t("classRequestWizard.whoIsComing")}</Label>
            <p className="text-xs text-muted-foreground" data-testid="wizard-invitees-note">
              {t("classRequestWizard.connectionsNote")}
            </p>
            {usernames.map((u, i) => {
              const check = checks[u.trim()];
              const code = checkCode(check);
              const state = !u.trim() ? "empty" : !check ? "checking" : code ?? "ok";
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={u}
                      placeholder={t("classRequestWizard.usernamePlaceholder")}
                      autoCapitalize="none"
                      autoCorrect="off"
                      data-testid={`wizard-invitee-${i}`}
                      data-state={state}
                      onChange={(e) => {
                        const value = e.target.value;
                        setUsernames((all) => all.map((x, j) => (j === i ? value : x)));
                      }}
                    />
                    {state === "checking" && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" />}
                  </div>
                  {check && !code && "name" in check && <p className="text-xs text-muted-foreground">{check.name}</p>}
                  {code && (
                    <p className="text-xs text-destructive" data-testid={`wizard-invitee-${i}-error`} data-reason={code}>
                      {t(`classRequestWizard.inviteeError.${code}`)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recorrência (rule 14) */}
      <div className="space-y-2">
        <Label>{t("classRequestWizard.recurrence")}</Label>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group">
          {(["single", "weekly"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={recurring === mode}
              data-testid={`wizard-recurrence-${mode}`}
              onClick={() => setRecurring(mode)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                recurring === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`classRequestWizard.recurrenceMode.${mode}`)}
            </button>
          ))}
        </div>
        {recurring === "single" ? (
          <div className="space-y-1">
            <Label htmlFor="wizard-date" className="text-xs">{t("classRequests.date")}</Label>
            <Input
              id="wizard-date"
              type="date"
              min={today}
              value={date}
              data-testid="wizard-date"
              onChange={(e) => {
                dateTouched.current = true;
                setDate(e.target.value);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={weekdays.includes(d)}
                  aria-label={t(`classRequestWizard.weekdays.${d}`)}
                  data-testid={`wizard-weekday-${d}`}
                  onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                  className={cn(
                    "h-9 w-9 rounded-full text-sm font-medium transition-colors",
                    weekdays.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted-foreground/10"
                  )}
                >
                  {t(`classRequestWizard.weekdayInitials.${d}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wizard-start-date" className="text-xs">{t("classRequestWizard.startDate")}</Label>
                <Input id="wizard-start-date" type="date" min={today} value={startDate} data-testid="wizard-start-date" onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wizard-end-date" className="text-xs">{t("classRequestWizard.endDate")}</Label>
                <Input id="wizard-end-date" type="date" min={startDate} value={endDate} data-testid="wizard-end-date" onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {!recurrenceValid && (
              <p className="text-xs text-destructive" data-testid="wizard-recurrence-error">
                {t("classRequestWizard.recurrenceInvalid")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Duração e horários livres (rule 13) */}
      <div className="space-y-2">
        <Label>{t("classRequests.duration")}</Label>
        <div className="flex gap-1" role="group">
          {CLASS_REQUEST_DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={duration === d}
              data-testid={`wizard-duration-${d}`}
              onClick={() => setDuration(d)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                duration === d ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              )}
            >
              {t("classRequests.minutes", { count: d })}
            </button>
          ))}
        </div>

        {availability?.workingHoursSource === "default" && (
          <p className="text-xs text-muted-foreground" data-testid="wizard-default-hours-note">
            {t("classRequestWizard.defaultHoursNote", { start: "08:00", end: "22:00" })}
          </p>
        )}

        <div data-testid="wizard-slots" data-state={loadingSlots ? "loading" : !allInviteesOk || !recurrenceValid ? "waiting" : starts.length ? "ready" : "empty"}>
          {loadingSlots ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : !allInviteesOk || !recurrenceValid ? null : starts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(recurring === "weekly" ? "classRequestWizard.noWeeklySlots" : "classRequests.noFreeBlocks")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {starts.map((s) => (
                <button
                  key={s.startTime}
                  type="button"
                  aria-pressed={slot?.startTime === s.startTime}
                  data-testid="wizard-slot"
                  data-start={s.startTime}
                  onClick={() => setSlot(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    slot?.startTime === s.startTime ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                  )}
                >
                  {s.startTime}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-note">{t("classRequests.note")}</Label>
        <Textarea id="wizard-note" rows={2} placeholder={t("classRequests.notePlaceholder")} value={note} data-testid="wizard-note" onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button onClick={send} disabled={sending || !slot || !allInviteesOk} data-testid="wizard-send">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("classRequests.send")}
        </Button>
      </div>
    </div>
  );
}
