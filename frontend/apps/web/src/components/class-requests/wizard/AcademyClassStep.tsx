/**
 * classes.academy-class-booking (PAD-358): the "Marcar Aula" wizard's academy step.
 *
 * The chosen coach's classes for the next fourteen club-local days that the
 * student may join (the server decides which — rule 2), grouped by day. An open
 * class is requested with an optional note (a `classes.join-requests` request);
 * a full class, marked with the destructive token, is joined on its waiting list.
 * A class the student already acted on shows that status instead (rule 7).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademyClass } from "@levelup/types";
import { NOTE_MAX_LENGTH, academyClassAction, groupAcademyClassesByDay } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { joinClassWaitingList, leaveClassWaitingList, listAcademyClasses } from "@/api/academyClasses";
import { createClassJoinRequest, joinRequestRefusal } from "@/api/classJoinRequests";

const academyClassesKey = (coachId: string) => ["academy-classes", coachId] as const;

function dayLabel(date: string, language: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function AcademyClassStep({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: academyClassesKey(coachId),
    queryFn: () => listAcademyClasses(coachId),
  });
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: academyClassesKey(coachId) });

  const run = async (c: AcademyClass, action: () => Promise<unknown>, success: string) => {
    setBusyId(c.id);
    try {
      await action();
      toast({ title: success });
      setNoteFor(null);
      setNote("");
      await refresh();
    } catch (err) {
      const code = joinRequestRefusal(err)?.code as string | undefined;
      // The class changed state between the list and the tap: say so and show its new state.
      const message =
        code === "spot_filled"
          ? t("classRequests.academy.nowFull")
          : code === "has_spots"
            ? t("classRequests.academy.nowOpen")
            : t("classRequests.academy.failed");
      toast({ title: message, variant: code ? "default" : "destructive" });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (query.isPending) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="academy-class-list" data-loading="true">
        {t("classRequests.academy.loading")}
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive" data-testid="academy-class-list" data-error="true">
        {t("classRequests.academy.loadError")}
      </p>
    );
  }

  const days = groupAcademyClassesByDay(query.data.classes);

  return (
    <div className="space-y-4" data-testid="academy-class-list">
      <p className="text-sm text-muted-foreground">{t("classRequests.academy.intro")}</p>
      {days.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="academy-class-empty">
          {t("classRequests.academy.empty")}
        </p>
      )}
      {days.map((day) => (
        <section key={day.date} className="space-y-2">
          <h3 className="text-sm font-semibold capitalize">{dayLabel(day.date, i18n.language)}</h3>
          {day.classes.map((c) => {
            const action = academyClassAction(c);
            const full = c.state === "full";
            const busy = busyId === c.id;
            return (
              <div
                key={c.id}
                data-testid="academy-class-row"
                data-state={c.state}
                data-class-id={c.id}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  full && "border-destructive/60 bg-destructive/5",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("font-medium truncate", full && "text-destructive")}>{c.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.startTime}–{c.endTime}
                      {c.club?.name ? ` · ${c.club.name}` : ""}
                    </p>
                  </div>
                  <Badge variant={full ? "destructive" : "secondary"} data-testid="academy-class-spots">
                    {full ? t("classRequests.academy.full") : t("classRequests.academy.spotsLeft", { count: c.spotsLeft })}
                  </Badge>
                </div>

                {action === "requested" && (
                  <p className="text-sm" data-testid="academy-class-status" data-status="requested">
                    {t("classRequests.academy.requested")}
                  </p>
                )}
                {action === "on_waitlist" && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm" data-testid="academy-class-status" data-status="on_waiting_list">
                      {t("classRequests.academy.onWaitlist")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      data-testid="academy-class-leave-waitlist"
                      onClick={() =>
                        run(
                          c,
                          () => leaveClassWaitingList(Number(c.originalId)),
                          t("classRequests.academy.leftWaitlist"),
                        )
                      }
                    >
                      {t("classRequests.academy.leaveWaitlist")}
                    </Button>
                  </div>
                )}
                {action === "join_waitlist" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    data-testid="academy-class-join-waitlist"
                    onClick={() => run(c, () => joinClassWaitingList(c), t("classRequests.academy.joinedWaitlist"))}
                  >
                    {t("classRequests.academy.joinWaitlist")}
                  </Button>
                )}
                {action === "request" && noteFor !== c.id && (
                  <Button
                    size="sm"
                    disabled={busy}
                    data-testid="academy-class-request"
                    onClick={() => {
                      setNoteFor(c.id);
                      setNote("");
                    }}
                  >
                    {t("classRequests.academy.request")}
                  </Button>
                )}
                {action === "request" && noteFor === c.id && (
                  <div className="space-y-2">
                    <Label htmlFor={`academy-note-${c.id}`}>{t("classRequests.academy.noteLabel")}</Label>
                    <Textarea
                      id={`academy-note-${c.id}`}
                      data-testid="academy-class-note"
                      maxLength={NOTE_MAX_LENGTH}
                      placeholder={t("classRequests.academy.notePlaceholder")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        data-testid="academy-class-send"
                        onClick={() =>
                          run(c, () => createClassJoinRequest(c, note), t("classRequests.academy.requestSent"))
                        }
                      >
                        {t("classRequests.academy.send")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                        {t("classRequests.academy.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onDone} data-testid="academy-class-done">
          {t("classRequests.academy.close")}
        </Button>
      </div>
    </div>
  );
}
