/**
 * classes.class-requests rule 21: the private class's three steps (people, when, time) on the phone, mirroring web's
 * PrivateSteps. Each is a body drawn over the shell's one draft (`usePrivateRequestDraft`); the foot, the back control
 * and Send belong to the screen. The controls are the single-form step's (rules 11 to 14a, PAD-357), split; step c also
 * holds rule 13b's list. Free time is rendered only through @levelup/config's availability module.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Pressable, View, findNodeHandle } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CLASS_REQUEST_DURATIONS,
  formatShortDate,
  lessonMinutes,
  JOIN_REFUSAL_CODES,
  joinRefusalKey,
  joinRefusalOf,
  academyClassAction,
  needsPrivateLessonWarning,
  occurrenceDates,
  readsPrivateLessons,
  privateRequestSummary,
} from "@levelup/config";
import { queryKeys, type PrivateRequestDraft } from "@levelup/hooks";
import type { ParticipantCheck } from "@levelup/types";
import { academyClassesApi } from "@levelup/api";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EndModeControls } from "./EndModeControls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ClassSideSheet } from "@/features/calendar/ClassSideSheet";
import { nativeLocaleTag } from "@/lib/native-locale";
import { cn } from "@/lib/utils";

const MAX_PEOPLE = 4;
// Monday-first, the recurrence's own convention (1 = Monday … 7 = Sunday).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** The refusal code of a failed check, or null for an accepted one. */
function checkCode(c: ParticipantCheck | undefined): string | null {
  return c && "code" in c ? c.code : null;
}

/** A round choice button: selected fills with the primary colour. */
function Chip({
  selected,
  onPress,
  testID,
  label,
  accessibilityLabel,
  round = false,
}: {
  selected: boolean;
  onPress: () => void;
  testID: string;
  label: string;
  accessibilityLabel?: string;
  round?: boolean;
}) {
  return (
    <Pressable
      role="button"
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "items-center justify-center border",
        round ? "h-11 w-11 rounded-full" : "min-h-11 rounded-full px-3",
        selected ? "border-primary bg-primary" : "border-border bg-background"
      )}
    >
      <Text
        maxFontSizeMultiplier={round ? 1.3 : undefined}
        className={cn("text-sm font-medium", selected ? "text-primary-foreground" : "text-foreground")}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One step's root: `class-request-wizard-private-<step>`, and its title takes the screen reader's focus when it shows (rule 21, criterion 62). */
function StepRoot({ step, children }: { step: "people" | "when" | "time"; children: React.ReactNode }) {
  const { t } = useTranslation();
  const title = React.useRef<unknown>(null);
  React.useEffect(() => {
    const tag = findNodeHandle(title.current as never);
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
  }, []);
  return (
    <View testID={`class-request-wizard-private-${step}`} collapsable={false}>
      <View className="gap-5" testID="wizard-private">
        <View ref={title as never} accessible accessibilityRole="header" testID="wizard-step-title">
          <Text className="text-base font-semibold">{t(`classRequestWizard.steps.${step}`)}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

export function PrivatePeopleStep({ draft }: { draft: PrivateRequestDraft }) {
  const { t } = useTranslation();
  const { people, setPeople, usernames, setUsernames, checks, repeated } = draft;
  return (
    <StepRoot step="people">
      {/* Nº de pessoas + Quem vai contigo (rule 12) */}
      <View className="gap-2">
        <Label>{t("classRequestWizard.people")}</Label>
        <View className="flex-row gap-1.5">
          {Array.from({ length: MAX_PEOPLE }, (_, i) => i + 1).map((n) => (
            <Chip
              key={n}
              round
              selected={people === n}
              onPress={() => setPeople(n)}
              testID={`wizard-people-${n}`}
              label={String(n)}
            />
          ))}
        </View>
        {people > 1 ? (
          <View className="gap-2 rounded-lg border border-border p-3" testID="wizard-invitees">
            <Label>{t("classRequestWizard.whoIsComing")}</Label>
            <Text className="text-xs text-muted-foreground" testID="wizard-invitees-note">
              {t("classRequestWizard.connectionsNote")}
            </Text>
            {usernames.map((u, i) => {
              const check = checks[u.trim()];
              const code = repeated[i] ? "DUPLICATE_INVITEE" : checkCode(check);
              const state = !u.trim() ? "empty" : repeated[i] ? "DUPLICATE_INVITEE" : !check ? "checking" : code ?? "ok";
              return (
                <View key={i} className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Input
                        testID={`wizard-invitee-${i}`}
                        accessibilityLabel={t("classRequestWizard.usernamePlaceholder")}
                        accessibilityValue={{ text: state }}
                        value={u}
                        placeholder={t("classRequestWizard.usernamePlaceholder")}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={(value) => setUsernames((all) => all.map((x, j) => (j === i ? value : x)))}
                      />
                    </View>
                    {state === "checking" ? <Spinner size="small" /> : null}
                  </View>
                  {check && !code && "name" in check ? (
                    <Text className="text-xs text-muted-foreground" testID={`wizard-invitee-${i}-ok`}>
                      {check.name}
                    </Text>
                  ) : null}
                  {code ? (
                    <Text className="text-xs text-destructive" testID={`wizard-invitee-${i}-error-${code}`}>
                      {t(`classRequestWizard.inviteeError.${code}`)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </StepRoot>
  );
}

export function PrivateWhenStep({ draft }: { draft: PrivateRequestDraft }) {
  const { t, i18n } = useTranslation();
  const {
    recurring, setRecurring, setDate, date, weekdays, setWeekdays, startDate, setStartDate, endDate, setEndDate,
    endMode, setEndMode, endCount, setEndCount, recurrenceValid,
  } = draft;
  const computedEndDate = endMode === "count" && draft.effectiveEndDate ? draft.effectiveEndDate : null;
  return (
    <StepRoot step="when">
      {/* Recorrência (rule 14) */}
      <View className="gap-2">
        <Label>{t("classRequestWizard.recurrence")}</Label>
        <View className="flex-row gap-1.5">
          {(["single", "weekly"] as const).map((mode) => (
            <Chip
              key={mode}
              selected={recurring === mode}
              onPress={() => setRecurring(mode)}
              testID={`wizard-recurrence-${mode}`}
              label={t(`classRequestWizard.recurrenceMode.${mode}`)}
            />
          ))}
        </View>
        {recurring === "single" ? (
          <DatePickerInput
            testID="wizard-date"
            label={t("classRequests.date")}
            value={date}
            onChange={setDate}
          />
        ) : (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d}
                  round
                  selected={weekdays.includes(d)}
                  onPress={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                  testID={`wizard-weekday-${d}`}
                  label={t(`classRequestWizard.weekdayInitials.${d}`)}
                  accessibilityLabel={t(`classRequestWizard.weekdays.${d}`)}
                />
              ))}
            </View>
            <DatePickerInput
              testID="wizard-start-date"
              label={t("classRequestWizard.startDate")}
              value={startDate}
              onChange={setStartDate}
            />

            {/* Rule 14a (PAD-428, PAD-926): the two ways a weekly request can end. */}
            <View className="gap-2">
              <EndModeControls
                endMode={endMode}
                onModeChange={setEndMode}
                endDate={endDate}
                onEndDateChange={setEndDate}
                endCount={endCount}
                onEndCountChange={setEndCount}
              />
              {endMode === "count" ? (
                <Text className="text-xs text-muted-foreground" testID="request-end-count-last-date">
                  {computedEndDate
                    ? t("classRequestWizard.lastClass", { date: formatShortDate(computedEndDate, nativeLocaleTag(i18n.language)) })
                    : t("classRequestWizard.recurrenceInvalid")}
                </Text>
              ) : null}
              <Text className="text-xs text-muted-foreground">{t("classRequestWizard.countHint")}</Text>
            </View>
            {!recurrenceValid ? (
              <Text className="text-xs text-destructive" testID="wizard-recurrence-error">
                {t("classRequestWizard.recurrenceInvalid")}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </StepRoot>
  );
}

export function PrivateTimeStep({
  draft, coachId, onChangeWhen, onNoteFocus,
}: { draft: PrivateRequestDraft; coachId: string; onChangeWhen: () => void; onNoteFocus?: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const {
    people, recurring, duration, setDuration, availability, slot, setSlot, note, setNote, starts, slotsState, answered,
  } = draft;

  // PAD-929 (classes.class-requests rule 13b), as on web: no free time offers the coach's visible
  // private lessons (classes.academy-class-booking rule 12); each row's one action goes through the
  // private-lesson warning, then the side sheet (classes.join-requests rule 22).
  const showPrivateLessons = readsPrivateLessons({ slotsState, answered, people });
  const privateLessons = useQuery({
    queryKey: ["academy-classes", coachId, "private"],
    queryFn: () => academyClassesApi.listAcademyClasses(coachId, "private"),
    enabled: showPrivateLessons,
  });
  const lessons = showPrivateLessons ? privateLessons.data?.classes ?? [] : [];
  const [lessonSideFor, setLessonSideFor] = React.useState<{ c: (typeof lessons)[number]; mode: "request" | "waiting" } | null>(null);
  const refreshLessons = () => void queryClient.invalidateQueries({ queryKey: ["academy-classes", coachId, "private"] });
  const summary = privateRequestSummary(
    { people, invitees: draft.invitees, recurring, date: draft.date, weekdays: draft.weekdays, endDate: draft.effectiveEndDate },
    (key, vars) => t(`classRequestWizard.${key}`, vars)
  );

  return (
    <StepRoot step="time">
      <Text className="text-sm text-muted-foreground" testID="wizard-summary">{summary}</Text>
      {/* Duração e horários livres (rule 13) */}
      <View className="gap-2">
        <Label>{t("classRequests.duration")}</Label>
        <View className="flex-row gap-1.5">
          {CLASS_REQUEST_DURATIONS.map((d) => (
            <Chip
              key={d}
              selected={duration === d}
              onPress={() => setDuration(d)}
              testID={`wizard-duration-${d}`}
              label={t("classRequests.minutes", { count: d })}
            />
          ))}
        </View>

        {availability?.workingHoursSource === "default" ? (
          <Text className="text-xs text-muted-foreground" testID="wizard-default-hours-note">
            {t("classRequestWizard.defaultHoursNote", { start: "08:00", end: "22:00" })}
          </Text>
        ) : null}

        {/* Maestro reads no data attributes: the state is in the id. The view is
            never collapsed and always has a child, or iOS flattens the empty
            "waiting" container out of the accessibility tree (E's flow 62). */}
        <View testID={`wizard-slots-${slotsState}`} collapsable={false}>
          {slotsState === "loading" ? (
            <Spinner size="small" />
          ) : slotsState === "waiting" ? (
            <View style={{ height: 1 }} accessible={false} />
          ) : slotsState === "empty" ? (
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">
                {t(recurring === "weekly" ? "classRequestWizard.noWeeklySlots" : "classRequests.noFreeBlocks")}
              </Text>
              <Button variant="outline" className="min-h-11" testID="wizard-change-when" onPress={onChangeWhen}>
                <Text>{t("classRequestWizard.changeWhen")}</Text>
              </Button>
              {lessons.length > 0 ? (
                <View className="gap-2" testID="wizard-private-lessons">
                  <Text className="text-sm font-medium">{t("classRequestWizard.privateLessonsTitle")}</Text>
                  {lessons.map((c) => {
                    const action = academyClassAction(c);
                    return (
                    <View
                      key={c.id}
                      testID={`wizard-private-lesson-row-${c.state}`}
                      className={cn(
                        "flex-row items-center justify-between gap-2 rounded-lg border p-3",
                        c.state === "full" ? "border-destructive/60 bg-destructive/5" : "border-border"
                      )}
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-medium">
                          {formatShortDate(c.date, nativeLocaleTag(i18n.language))} · {c.startTime}–{c.endTime}
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                          {t("classRequests.minutes", { count: lessonMinutes(c) })}
                          {c.club?.name ? ` · ${c.club.name}` : ""}
                        </Text>
                      </View>
                      <View className="items-end gap-2">
                        <Badge variant={c.state === "full" ? "destructive" : "secondary"}>
                          <Text>
                            {c.state === "full"
                              ? t("classRequests.academy.full")
                              : t("classRequests.academy.spotsLeft", { count: c.spotsLeft })}
                          </Text>
                        </Badge>
                        {action === "requested" ? (
                          <Text testID="wizard-private-lesson-status" className="text-sm">{t("classRequests.academy.requested")}</Text>
                        ) : null}
                        {action === "on_waitlist" ? (
                          <Text testID="wizard-private-lesson-status" className="text-sm">{t("classRequests.academy.onWaitlist")}</Text>
                        ) : null}
                        {action === "request" ? (
                          <Button size="sm" testID="wizard-private-lesson-request" onPress={() => setLessonSideFor({ c, mode: "request" })}>
                            <Text>{t("classRequests.academy.request")}</Text>
                          </Button>
                        ) : null}
                        {action === "join_waitlist" ? (
                          <Button size="sm" variant="destructive" testID="wizard-private-lesson-waitlist" onPress={() => setLessonSideFor({ c, mode: "waiting" })}>
                            <Text>{t("classRequests.academy.joinWaitlist")}</Text>
                          </Button>
                        ) : null}
                      </View>
                    </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-1.5">
              {starts.map((s) => (
                <Chip
                  key={s.startTime}
                  selected={slot?.startTime === s.startTime}
                  onPress={() => setSlot(s)}
                  testID={`wizard-slot-${s.startTime}`}
                  label={s.startTime}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      <View className="gap-2">
        <Label>{t("classRequests.note")}</Label>
        <Textarea
          testID="wizard-note"
          accessibilityLabel={t("classRequests.note")}
          placeholder={t("classRequests.notePlaceholder")}
          value={note}
          onChangeText={setNote}
          onFocus={onNoteFocus}
        />
      </View>

      {lessonSideFor ? (
        <ClassSideSheet
          open
          onClose={() => setLessonSideFor(null)}
          mode={lessonSideFor.mode}
          event={lessonSideFor.c}
          profileSide={lessonSideFor.c.profileSide ?? privateLessons.data?.profileSide ?? null}
          privateWarning={needsPrivateLessonWarning(lessonSideFor.c, lessonSideFor.mode === "waiting" ? "waitlist" : "request")}
          onPrivateUnconfirmed={refreshLessons}
          onRequestSent={() => {
            toast.success(t("classRequests.academy.requestSent"));
            refreshLessons();
          }}
          onWaitingListJoined={() => {
            toast.success(t("classRequests.academy.joinedWaitlist"));
            refreshLessons();
          }}
          onFailed={(err) => {
            const code = joinRefusalOf(err)?.code;
            if (code && (JOIN_REFUSAL_CODES as readonly string[]).includes(code)) toast.error(t(joinRefusalKey(code)));
            else toast.error(t("classRequests.academy.failed"));
            refreshLessons();
          }}
        />
      ) : null}
    </StepRoot>
  );
}

/** Rule 21: Send, as the single form sent it; the screen's foot calls it. */
export function usePrivateSend(draft: PrivateRequestDraft, coachId: string, onDone: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return async () => {
    const { slot, recurrence, date, note, invitees } = draft;
    if (!slot) return;
    draft.setSending(true);
    try {
      await classRequestsApi.createClassRequest({
        coachId,
        date: recurrence ? occurrenceDates(recurrence)[0] : date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: note.trim() || null,
        participants: invitees.length ? invitees : undefined,
        recurrence: recurrence ?? undefined,
      });
      toast.success(t("classRequests.sent"), t("classRequests.sentBody"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.classRequests });
      onDone();
    } catch (err) {
      const refusal = classRequestsApi.classRequestRefusal(err);
      const detail = refusal
        ? t(`classRequestWizard.refusal.${refusal.code}`, {
            defaultValue: t(`classRequests.refusal.${refusal.code}`, { defaultValue: "" }),
          })
        : "";
      toast.error(t("classRequests.failed"), detail || undefined);
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
    <Button className="h-auto min-h-11 w-full" testID="wizard-send" disabled={sending || !answered} onPress={onSend}>
      {sending ? <Spinner size="small" color="white" /> : null}
      <Text>{t("classRequests.send")}</Text>
    </Button>
  ) : (
    <Button className="h-auto min-h-11 w-full" testID="wizard-continue" disabled={!answered} onPress={onContinue}>
      <Text>{t("classRequestWizard.continue")}</Text>
    </Button>
  );
}
