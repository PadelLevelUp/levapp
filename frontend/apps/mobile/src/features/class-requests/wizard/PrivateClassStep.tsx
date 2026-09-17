/**
 * PAD-357 (classes.class-requests rules 12–14, classes.availability): the
 * private-class step, mirroring web's PrivateClassStep. Nº de pessoas 1–4 with
 * "Quem vai contigo" usernames (each checked against the coach's roster), single
 * or weekly recurrence, duration, the free start times everyone shares, an
 * optional note, send. Free time comes from the server as `freeWindows` and is
 * rendered only through @levelup/config's availability module, so web and iOS
 * cannot offer different times.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
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
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
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
        round ? "h-9 w-9 rounded-full" : "rounded-full px-3 py-1.5",
        selected ? "border-primary bg-primary" : "border-border bg-background"
      )}
    >
      <Text className={cn("text-sm font-medium", selected ? "text-primary-foreground" : "text-foreground")}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PrivateClassStep({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = clubTodayISO();

  // ── People ──
  const [people, setPeople] = React.useState(1);
  const [usernames, setUsernames] = React.useState<string[]>([]);
  const [checks, setChecks] = React.useState<Record<string, ParticipantCheck>>({});

  // ── Recurrence ──
  const [recurring, setRecurring] = React.useState<Recurring>("single");
  const [date, setDate] = React.useState(today);
  const dateTouched = React.useRef(false);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(addDaysIso(today, 28));

  // ── Slot ──
  const [duration, setDuration] = React.useState<number>(60);
  const [availability, setAvailability] = React.useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [slot, setSlot] = React.useState<Window | null>(null);
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const invitees = usernames
    .slice(0, people - 1)
    .map((u) => u.trim())
    .filter(Boolean);
  const inviteesKey = invitees.join(",");
  const allInviteesOk = invitees.length === people - 1 && invitees.every((u) => checks[u]?.ok === true);

  // Keep one username field per invitee.
  React.useEffect(() => {
    setUsernames((u) => Array.from({ length: people - 1 }, (_, i) => u[i] ?? ""));
  }, [people]);

  // Rule 12: each username checked against this coach's roster (debounced).
  React.useEffect(() => {
    const pending = invitees.filter((u) => !checks[u]);
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      requestAvailabilityApi
        .getRequestParticipants(coachId, pending)
        .then((rows) => setChecks((c) => ({ ...c, ...Object.fromEntries(rows.map((r) => [r.username, r])) })))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey]);

  const recurrence =
    recurring === "weekly" ? { weekdays: [...weekdays].sort((a, b) => a - b), startDate, endDate } : null;
  const recurrenceValid =
    !recurrence || (weekdays.length > 0 && startDate <= endDate && occurrenceDates(recurrence).length > 0);

  // Rules 11 + 13: for a single class open on the first day that still has free time.
  React.useEffect(() => {
    if (recurring !== "single" || dateTouched.current || !allInviteesOk) return;
    let active = true;
    requestAvailabilityApi
      .getCoachAvailability({
        coachId,
        from: today,
        to: addDaysIso(today, FIRST_FREE_DAY_HORIZON_DAYS),
        participants: invitees,
      })
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
  React.useEffect(() => {
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
    requestAvailabilityApi
      .getCoachAvailability({ coachId, from, to, participants: invitees })
      .then((res) => active && setAvailability(res))
      .catch(() => active && setAvailability(null))
      .finally(() => active && setLoadingSlots(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey, allInviteesOk, recurring, date, startDate, endDate, weekdays.join(","), recurrenceValid]);

  const starts = React.useMemo(() => {
    if (!availability) return [];
    if (recurrence) return slotStarts(weeklyIntersection(availability.freeWindows, recurrence).windows, duration);
    return slotStarts(availability.freeWindows[date] ?? [], duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, duration, date, recurring, weekdays.join(","), startDate, endDate]);

  const send = async () => {
    if (!slot) return;
    setSending(true);
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
      setSlot(null);
    } finally {
      setSending(false);
    }
  };

  const slotsState = loadingSlots
    ? "loading"
    : !allInviteesOk || !recurrenceValid
      ? "waiting"
      : starts.length
        ? "ready"
        : "empty";

  return (
    <View className="gap-5" testID="wizard-private">
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
              const code = checkCode(check);
              const state = !u.trim() ? "empty" : !check ? "checking" : code ?? "ok";
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
            onChange={(v) => {
              dateTouched.current = true;
              setDate(v);
            }}
          />
        ) : (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d}
                  round
                  selected={weekdays.includes(d)}
                  onPress={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                  testID={`wizard-weekday-${d}`}
                  label={t(`classRequestWizard.weekdayInitials.${d}`)}
                  accessibilityLabel={t(`classRequestWizard.weekdays.${d}`)}
                />
              ))}
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <DatePickerInput
                  testID="wizard-start-date"
                  label={t("classRequestWizard.startDate")}
                  value={startDate}
                  onChange={setStartDate}
                />
              </View>
              <View className="flex-1">
                <DatePickerInput
                  testID="wizard-end-date"
                  label={t("classRequestWizard.endDate")}
                  value={endDate}
                  onChange={setEndDate}
                />
              </View>
            </View>
            {!recurrenceValid ? (
              <Text className="text-xs text-destructive" testID="wizard-recurrence-error">
                {t("classRequestWizard.recurrenceInvalid")}
              </Text>
            ) : null}
          </View>
        )}
      </View>

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

        {/* Maestro reads no data attributes: the state is in the id. */}
        <View testID={`wizard-slots-${slotsState}`}>
          {slotsState === "loading" ? (
            <Spinner size="small" />
          ) : slotsState === "waiting" ? null : slotsState === "empty" ? (
            <Text className="text-sm text-muted-foreground">
              {t(recurring === "weekly" ? "classRequestWizard.noWeeklySlots" : "classRequests.noFreeBlocks")}
            </Text>
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
        />
      </View>

      <Button testID="wizard-send" disabled={sending || !slot || !allInviteesOk} onPress={() => void send()}>
        {sending ? <Spinner size="small" color="white" /> : null}
        <Text>{t("classRequests.send")}</Text>
      </Button>
    </View>
  );
}
