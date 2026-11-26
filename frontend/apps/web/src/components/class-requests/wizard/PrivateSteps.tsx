/**
 * classes.class-requests rule 21: the private class's three steps (people, when, time). Each is a body drawn over
 * the shell's one draft (`usePrivateRequestDraft`); the foot, the back control and Send belong to the wizard.
 * The controls are the single-form step's (rules 11 to 14a, PAD-357), split; step c also holds rule 13b's list.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import {
  CLASS_REQUEST_DURATIONS,
  MAX_REQUEST_CLASSES,
  stepEndCount,
  formatShortDate,
  lessonMinutes,
  occurrenceDates,
  joinRefusalKey,
  joinRefusalOf,
  needsPrivateLessonWarning,
  waitingListSideChoice,
  academyClassAction,
  readsPrivateLessons,
  privateRequestSummary,
} from "@levelup/config";
import { queryKeys, type PrivateRequestDraft } from "@levelup/hooks";
import type { ParticipantCheck } from "@levelup/types";
import { academyClassesApi } from "@levelup/api";
import { classRequestRefusal, createClassRequest } from "@/api/classRequests";
import { ClassSideChoice } from "@/components/calendar/ClassSideChoice";
import { Badge } from "@/components/ui/badge";
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

/** One step's root: `data-private-step`, and its title takes the focus when it shows (rule 21, criterion 62). */
function StepRoot({ step, children }: { step: "people" | "when" | "time"; children: ReactNode }) {
  const { t } = useTranslation();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <div className="space-y-5" data-testid="wizard-private" data-private-step={step}>
      <h3 ref={title} tabIndex={-1} className="text-base font-semibold outline-none" data-testid="wizard-step-title">
        {t(`classRequestWizard.steps.${step}`)}
      </h3>
      {children}
    </div>
  );
}

export function PrivatePeopleStep({ draft }: { draft: PrivateRequestDraft }) {
  const { t } = useTranslation();
  const { people, setPeople, usernames, setUsernames, checks, repeated } = draft;
  return (
    <StepRoot step="people">
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
                "h-11 w-11 rounded-full text-sm font-medium transition-colors",
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
              const code = repeated[i] ? "DUPLICATE_INVITEE" : checkCode(check);
              const state = !u.trim() ? "empty" : repeated[i] ? "DUPLICATE_INVITEE" : !check ? "checking" : code ?? "ok";
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
    </StepRoot>
  );
}

export function PrivateWhenStep({ draft }: { draft: PrivateRequestDraft }) {
  const { t, i18n } = useTranslation();
  const {
    recurring, setRecurring, date, setDate, weekdays, setWeekdays, startDate, setStartDate, endDate, setEndDate,
    endMode, setEndMode, endCount, setEndCount, recurrenceValid, today,
  } = draft;
  const computedEndDate = draft.effectiveEndDate && endMode === "count" ? draft.effectiveEndDate : null;
  return (
    <StepRoot step="when">
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
                "rounded-md min-h-11 px-3 text-sm font-medium transition-colors",
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
              onChange={(e) => setDate(e.target.value)}
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
                  onClick={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                  className={cn(
                    "h-11 w-11 rounded-full text-sm font-medium transition-colors",
                    weekdays.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted-foreground/10"
                  )}
                >
                  {t(`classRequestWizard.weekdayInitials.${d}`)}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="wizard-start-date" className="text-xs">{t("classRequestWizard.startDate")}</Label>
              <Input id="wizard-start-date" type="date" min={today} value={startDate} data-testid="wizard-start-date" onChange={(e) => setStartDate(e.target.value)} />
            </div>

            {/* Rule 14a (PAD-428, PAD-926): the two ways a weekly request can end, as a segmented control. */}
            <div className="space-y-2">
              <div
                role="radiogroup"
                aria-label={t("classRequestWizard.endDate")}
                className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
              >
                {(["date", "count"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={endMode === mode}
                    data-testid={`request-end-mode-${mode}`}
                    onClick={() => setEndMode(mode)}
                    className={cn(
                      "h-11 rounded px-2 text-xs font-medium",
                      endMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {t(`classRequestWizard.endMode.${mode}`)}
                  </button>
                ))}
              </div>
              {endMode === "date" ? (
                <Input
                  id="wizard-end-date"
                  type="date"
                  min={startDate}
                  value={endDate}
                  aria-label={t("classRequestWizard.endMode.date")}
                  data-testid="wizard-end-date"
                  onChange={(e) => setEndDate(e.target.value)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={t("classRequestWizard.countDecrease")}
                    data-testid="request-end-count-dec"
                    disabled={endCount <= 1}
                    onClick={() => setEndCount(stepEndCount(endCount, -1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-8 text-center text-base font-semibold" data-testid="request-end-count" aria-live="polite">
                    {endCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={t("classRequestWizard.countIncrease")}
                    data-testid="request-end-count-inc"
                    disabled={endCount >= MAX_REQUEST_CLASSES}
                    onClick={() => setEndCount(stepEndCount(endCount, 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("classRequestWizard.classesUnit")}</span>
                </div>
              )}
              {endMode === "count" && (
                <p className="text-xs text-muted-foreground" data-testid="request-end-count-last-date">
                  {computedEndDate
                    ? t("classRequestWizard.lastClass", { date: formatShortDate(computedEndDate, i18n.language) })
                    : t("classRequestWizard.recurrenceInvalid")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("classRequestWizard.countHint")}</p>
            </div>
            {!recurrenceValid && (
              <p className="text-xs text-destructive" data-testid="wizard-recurrence-error">
                {t("classRequestWizard.recurrenceInvalid")}
              </p>
            )}
          </div>
        )}
      </div>
    </StepRoot>
  );
}

export function PrivateTimeStep({ draft, coachId, onChangeWhen }: { draft: PrivateRequestDraft; coachId: string; onChangeWhen: () => void }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    people, recurring, duration, setDuration, availability, loadingSlots, slot, setSlot, note, setNote, starts, slotsState,
    allInviteesOk, recurrenceValid, answered,
  } = draft;

  // PAD-929 (classes.class-requests rule 13b): no free time offers the coach's visible private
  // lessons (classes.academy-class-booking rule 12); each row's one action goes through the
  // private-lesson warning, then the side choice (classes.join-requests rule 22).
  const showPrivateLessons = readsPrivateLessons({ slotsState, answered, people });
  const privateLessons = useQuery({
    queryKey: ["academy-classes", coachId, "private"],
    queryFn: () => academyClassesApi.listAcademyClasses(coachId, "private"),
    enabled: showPrivateLessons,
  });
  const lessons = showPrivateLessons ? privateLessons.data?.classes ?? [] : [];
  const [lessonSideFor, setLessonSideFor] = useState<{ c: (typeof lessons)[number]; mode: "request" | "waiting" } | null>(null);
  const refreshLessons = () => void queryClient.invalidateQueries({ queryKey: ["academy-classes", coachId, "private"] });
  const summary = privateRequestSummary(
    { people, invitees: draft.invitees, recurring, date: draft.date, weekdays: draft.weekdays, endDate: draft.effectiveEndDate },
    (key, vars) => t(`classRequestWizard.${key}`, vars)
  );

  return (
    <StepRoot step="time">
      <p className="text-sm text-muted-foreground" data-testid="wizard-summary">{summary}</p>
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
                "rounded-full border min-h-11 px-4 text-sm transition-colors",
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

        <div data-testid="wizard-slots" data-state={slotsState}>
          {loadingSlots ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : !allInviteesOk || !recurrenceValid ? null : starts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t(recurring === "weekly" ? "classRequestWizard.noWeeklySlots" : "classRequests.noFreeBlocks")}</p>
              <Button type="button" variant="outline" className="min-h-11" data-testid="wizard-change-when" onClick={onChangeWhen}>
                {t("classRequestWizard.changeWhen")}
              </Button>
              {lessons.length > 0 && (
                <div className="space-y-2" data-testid="wizard-private-lessons">
                  <p className="text-sm font-medium">{t("classRequestWizard.privateLessonsTitle")}</p>
                  {lessons.map((c) => {
                    const action = academyClassAction(c);
                    return (
                    <div
                      key={c.id}
                      data-testid={`wizard-private-lesson-row-${c.state}`}
                      data-class-id={c.id}
                      className={cn("flex items-center justify-between gap-2 rounded-lg border p-3", c.state === "full" && "border-destructive/60 bg-destructive/5")}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatShortDate(c.date, i18n.language)} · {c.startTime}–{c.endTime}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("classRequests.minutes", { count: lessonMinutes(c) })}
                          {c.club?.name ? ` · ${c.club.name}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge variant={c.state === "full" ? "destructive" : "secondary"}>
                          {c.state === "full" ? t("classRequests.academy.full") : t("classRequests.academy.spotsLeft", { count: c.spotsLeft })}
                        </Badge>
                        {action === "requested" && (
                          <p className="text-sm" data-testid="wizard-private-lesson-status" data-status="requested">
                            {t("classRequests.academy.requested")}
                          </p>
                        )}
                        {action === "on_waitlist" && (
                          <p className="text-sm" data-testid="wizard-private-lesson-status" data-status="on_waiting_list">
                            {t("classRequests.academy.onWaitlist")}
                          </p>
                        )}
                        {action === "request" && (
                          <Button size="sm" data-testid="wizard-private-lesson-request" onClick={() => setLessonSideFor({ c, mode: "request" })}>
                            {t("classRequests.academy.request")}
                          </Button>
                        )}
                        {action === "join_waitlist" && (
                          <Button size="sm" variant="destructive" data-testid="wizard-private-lesson-waitlist" onClick={() => setLessonSideFor({ c, mode: "waiting" })}>
                            {t("classRequests.academy.joinWaitlist")}
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                    "rounded-full border min-h-11 px-4 text-sm transition-colors",
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

      {lessonSideFor && (
        <ClassSideChoice
          open
          onOpenChange={(o) => {
            if (!o) setLessonSideFor(null);
          }}
          mode={lessonSideFor.mode}
          event={lessonSideFor.c}
          profileSide={lessonSideFor.c.profileSide ?? privateLessons.data?.profileSide ?? null}
          relativeChoice={waitingListSideChoice(lessonSideFor.c)}
          privateWarning={needsPrivateLessonWarning(lessonSideFor.c, lessonSideFor.mode === "waiting" ? "waitlist" : "request")}
          onPrivateUnconfirmed={refreshLessons}
          onRequestSent={() => {
            toast({ title: t("classRequests.academy.requestSent") });
            refreshLessons();
          }}
          onWaitingListJoined={() => {
            toast({ title: t("classRequests.academy.joinedWaitlist") });
            refreshLessons();
          }}
          onFailed={(err) => {
            const code = joinRefusalOf(err)?.code;
            toast({ title: code ? t(joinRefusalKey(code)) : t("classRequests.academy.failed"), variant: code ? "default" : "destructive" });
            refreshLessons();
          }}
        />
      )}
    </StepRoot>
  );
}

/** Rule 21: Send, as the single form sent it; the wizard's foot calls it. */
export function usePrivateSend(draft: PrivateRequestDraft, coachId: string, onDone: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return async () => {
    const { slot, recurrence, date, note, invitees } = draft;
    if (!slot) return;
    draft.setSending(true);
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
      draft.setSlot(null);
    } finally {
      draft.setSending(false);
    }
  };
}

/** Rule 21's foot: one main button, full width and at least 44px high; "Continuar" in a and b, Send in c. */
export function PrivateFoot({
  step, answered, sending, onContinue, onSend,
}: {
  step: "people" | "when" | "time"; answered: boolean; sending: boolean; onContinue: () => void; onSend: () => void;
}) {
  const { t } = useTranslation();
  return step === "time" ? (
    <Button className="h-auto min-h-11 w-full" onClick={onSend} disabled={sending || !answered} data-testid="wizard-send">
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("classRequests.send")}
    </Button>
  ) : (
    <Button className="h-auto min-h-11 w-full" onClick={onContinue} disabled={!answered} data-testid="wizard-continue">
      {t("classRequestWizard.continue")}
    </Button>
  );
}
