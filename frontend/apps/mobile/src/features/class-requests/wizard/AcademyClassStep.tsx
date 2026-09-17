/**
 * classes.academy-class-booking (PAD-358): the "Marcar Aula" wizard's academy step
 * on iOS, mirroring web's AcademyClassStep.
 *
 * The chosen coach's classes for the next fourteen club-local days that the
 * student may join (the server decides which, rule 2), grouped by day. An open
 * class is requested with an optional note (a `classes.join-requests` request);
 * a full class, marked with the destructive token, is joined on its waiting list.
 * A class the student already acted on shows that status instead (rule 7). What
 * each row offers comes from @levelup/config's `academyClassAction`, so web and
 * iOS cannot disagree.
 *
 * Test ids carry the state (rule 10), because Maestro cannot read attributes:
 * a row is `academy-class-row-open|full`, a status `academy-class-status-requested|waitlist`.
 * The note field is inline in the row, not in a sheet: the PAD-356 block sheet's
 * crash inside a native Modal is still unexplained.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademyClass } from "@levelup/types";
import { NOTE_MAX_LENGTH, academyClassAction, groupAcademyClassesByDay } from "@levelup/config";
import { academyClassesApi, classJoinRequestsApi } from "@levelup/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { nativeLocaleTag } from "@/lib/native-locale";
import { cn } from "@/lib/utils";

const academyClassesKey = (coachId: string) => ["academy-classes", coachId] as const;

function dayLabel(date: string, language: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(nativeLocaleTag(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function AcademyClassStep({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: academyClassesKey(coachId),
    queryFn: () => academyClassesApi.listAcademyClasses(coachId),
  });
  const [noteFor, setNoteFor] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: academyClassesKey(coachId) });

  const run = async (c: AcademyClass, action: () => Promise<unknown>, success: string) => {
    setBusyId(c.id);
    try {
      await action();
      toast.success(success);
      setNoteFor(null);
      setNote("");
      await refresh();
    } catch (err) {
      const code = classJoinRequestsApi.joinRequestRefusal(err)?.code as string | undefined;
      // The class changed state between the list and the tap: say so and show its new state.
      if (code === "spot_filled") toast.warning(t("classRequests.academy.nowFull"));
      else if (code === "has_spots") toast.warning(t("classRequests.academy.nowOpen"));
      else toast.error(t("classRequests.academy.failed"));
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (query.isPending) {
    return (
      <View testID="academy-class-list" className="flex-row items-center gap-2 py-4">
        <Spinner size="small" />
        <Text className="text-sm text-muted-foreground">{t("classRequests.academy.loading")}</Text>
      </View>
    );
  }
  if (query.isError) {
    return (
      <View testID="academy-class-list" className="py-4">
        <Text testID="academy-class-load-error" className="text-sm text-destructive">
          {t("classRequests.academy.loadError")}
        </Text>
      </View>
    );
  }

  const days = groupAcademyClassesByDay(query.data.classes);

  return (
    <View testID="academy-class-list" className="gap-4">
      <Text className="text-sm text-muted-foreground">{t("classRequests.academy.intro")}</Text>
      {days.length === 0 ? (
        <View testID="academy-class-empty" className="rounded-md border border-dashed border-border p-4">
          <Text className="text-sm text-muted-foreground">
            {query.data.openSpotsVisible
              ? t("classRequests.academy.empty")
              : t("classRequests.academy.emptyNotAdvertised")}
          </Text>
        </View>
      ) : null}
      {days.map((day) => (
        <View key={day.date} className="gap-2">
          <Text className="text-sm font-semibold capitalize">{dayLabel(day.date, i18n.language)}</Text>
          {day.classes.map((c) => {
            const action = academyClassAction(c);
            const full = c.state === "full";
            const busy = busyId === c.id;
            return (
              <View
                key={c.id}
                testID={`academy-class-row-${c.state}`}
                className={cn(
                  "gap-2 rounded-lg border p-3",
                  full ? "border-destructive/60 bg-destructive/5" : "border-border"
                )}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className={cn("font-medium", full && "text-destructive")} numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {c.startTime}–{c.endTime}
                      {c.club?.name ? ` · ${c.club.name}` : ""}
                    </Text>
                  </View>
                  <Badge variant={full ? "destructive" : "secondary"}>
                    <Text>
                      {full
                        ? t("classRequests.academy.full")
                        : t("classRequests.academy.spotsLeft", { count: c.spotsLeft })}
                    </Text>
                  </Badge>
                </View>

                {action === "requested" ? (
                  <Text testID="academy-class-status-requested" className="text-sm">
                    {t("classRequests.academy.requested")}
                  </Text>
                ) : null}
                {action === "on_waitlist" ? (
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <Text testID="academy-class-status-waitlist" className="text-sm">
                      {t("classRequests.academy.onWaitlist")}
                    </Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      testID="academy-class-leave-waitlist"
                      accessibilityLabel={t("classRequests.academy.leaveWaitlist")}
                      onPress={() =>
                        void run(
                          c,
                          () => academyClassesApi.leaveClassWaitingList(Number(c.originalId)),
                          t("classRequests.academy.leftWaitlist")
                        )
                      }
                    >
                      <Text>{t("classRequests.academy.leaveWaitlist")}</Text>
                    </Button>
                  </View>
                ) : null}
                {action === "join_waitlist" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    testID="academy-class-join-waitlist"
                    accessibilityLabel={t("classRequests.academy.joinWaitlist")}
                    onPress={() =>
                      void run(
                        c,
                        () => academyClassesApi.joinClassWaitingList(c),
                        t("classRequests.academy.joinedWaitlist")
                      )
                    }
                  >
                    <Text>{t("classRequests.academy.joinWaitlist")}</Text>
                  </Button>
                ) : null}
                {action === "request" && noteFor !== c.id ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    testID="academy-class-request"
                    accessibilityLabel={t("classRequests.academy.request")}
                    onPress={() => {
                      setNoteFor(c.id);
                      setNote("");
                    }}
                  >
                    <Text>{t("classRequests.academy.request")}</Text>
                  </Button>
                ) : null}
                {action === "request" && noteFor === c.id ? (
                  <View className="gap-2">
                    <Label>{t("classRequests.academy.noteLabel")}</Label>
                    <Textarea
                      testID="academy-class-note"
                      accessibilityLabel={t("classRequests.academy.noteLabel")}
                      maxLength={NOTE_MAX_LENGTH}
                      placeholder={t("classRequests.academy.notePlaceholder")}
                      value={note}
                      onChangeText={setNote}
                    />
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        testID="academy-class-send"
                        accessibilityLabel={t("classRequests.academy.send")}
                        onPress={() =>
                          void run(
                            c,
                            () => classJoinRequestsApi.createClassJoinRequest(c, note),
                            t("classRequests.academy.requestSent")
                          )
                        }
                      >
                        <Text>{t("classRequests.academy.send")}</Text>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        testID="academy-class-cancel-note"
                        accessibilityLabel={t("classRequests.academy.cancel")}
                        onPress={() => setNoteFor(null)}
                      >
                        <Text>{t("classRequests.academy.cancel")}</Text>
                      </Button>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <View className="flex-row justify-end">
        <Button
          variant="outline"
          testID="academy-class-done"
          accessibilityLabel={t("classRequests.academy.close")}
          onPress={onDone}
        >
          <Text>{t("classRequests.academy.close")}</Text>
        </Button>
      </View>
    </View>
  );
}
