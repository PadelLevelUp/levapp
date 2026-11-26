/**
 * classes.class-requests (PAD-104). The student's section: "Marcar aula" opens the PAD-357 wizard, and
 * their own requests, with withdraw / answer a proposal — accept, decline, or propose another time
 * (rule 10, PAD-281). The coach's side is the paged table (`CoachRequestsTable`,
 * classes.coach-requests-table, PAD-795).
 * Free time is the coach's calendar minus what is on it (rule 1); the slot is
 * held on the coach's calendar while the request is open (rule 3).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, refreshAfterRequestChange } from "@levelup/hooks";
import { CalendarPlus, Clock } from "lucide-react";
import type { ClassJoinRequestListRow, ClassRequest, ClassWaitingListRow } from "@levelup/types";
import {
  CLASS_REQUEST_DURATIONS,
  classRequestRefusalLines,
  clubDateOfInstant,
  clubTodayISO,
  mergeClassRequestRows,
  resolveText,
  slotOptions,
  splitClassRequestRows,
  type MergedClassRequestRow,
} from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClassRequestWizard } from "./wizard/ClassRequestWizard";
import { cn } from "@/lib/utils";
import {
  answerClassRequestProposal,
  classRequestRefusal,
  counterProposeClassRequest,
  getFreeBlocks,
  listClassRequests,
  withdrawClassRequest,
} from "@/api/classRequests";
import { listClassJoinRequests, withdrawClassJoinRequest } from "@/api/classJoinRequests";
import { leaveClassWaitingList, listClassWaitingList } from "@/api/academyClasses";

const OPEN = new Set(["pending", "countered"]);

function todayIso(): string {
  return clubTodayISO(); // B-060: the club's date, not the device's
}

// Shared by the private row and the academy row (rule 17) — `rejected` and
// `superseded` are academy-only statuses a private ClassRequest never has.
function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "declined" || status === "rejected") return "destructive";
  if (status === "withdrawn" || status === "superseded") return "outline";
  return "secondary";
}

export function ClassRequestsSection() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  // The list is a react-query row so the proposal bubble in chat and this
  // section read the same cache, refreshed by `class_request_changed` (rule 6).
  const queryClient = useQueryClient();
  const requestsQuery = useQuery({ queryKey: queryKeys.classRequests, queryFn: listClassRequests });
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  // classes.join-requests rule 17 (PAD-460): academy requests, shown beside the
  // private ones above, merged newest first (`@levelup/config`, shared with iOS).
  const joinRequestsQuery = useQuery({ queryKey: queryKeys.classJoinRequests, queryFn: listClassJoinRequests });
  const joinRequests = useMemo(() => joinRequestsQuery.data ?? [], [joinRequestsQuery.data]);
  // classes.academy-class-booking rule 11 (PAD-504): the student's waiting-list places.
  const waitingListQuery = useQuery({
    queryKey: queryKeys.classWaitingList,
    queryFn: listClassWaitingList,
  });
  const waitingRows = useMemo(() => waitingListQuery.data ?? [], [waitingListQuery.data]);
  const [confirmLeaveId, setConfirmLeaveId] = useState<number | null>(null);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const loading =
    requestsQuery.isPending || joinRequestsQuery.isPending || waitingListQuery.isPending;
  const [busyId, setBusyId] = useState<number | null>(null);
  // A separate busy key: academy join-request ids are their own id space, never
  // compared against a private request's.
  const [busyJoinId, setBusyJoinId] = useState<number | null>(null);
  // Rule 10: the student's "propose another time" picker, opened from the row or
  // from the chat bubble (`?proposeFor=<id>`).
  const [counteringId, setCounteringId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const counterRowRef = useRef<HTMLDivElement | null>(null);

  // Student booking flow: the PAD-357 wizard (its steps own their state).
  const [booking, setBooking] = useState(false);

  const refresh = async () => {
    // The request lists, the class sheet's own read wherever it is cached (an academy
    // decision made from this list must not leave it stale) and, rule 19 (PAD-488),
    // the calendar.
    await refreshAfterRequestChange(queryClient);
  };

  useEffect(() => {
    if (requestsQuery.isError || joinRequestsQuery.isError) {
      toast({ variant: "destructive", title: t("classRequests.loadFailed") });
    }
  }, [requestsQuery.isError, joinRequestsQuery.isError, t, toast]);

  // `?proposeFor=<id>` comes from the chat bubble's "Propose another time": the student's picker on
  // a countered request (the coach's form is the table's, classes.coach-requests-table rule 16).
  useEffect(() => {
    const wanted = Number(searchParams.get("proposeFor"));
    if (!wanted || loading) return;
    const row = requests.find((r) => r.id === wanted);
    if (row && row.status === "countered") setCounteringId(wanted);
    searchParams.delete("proposeFor");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, requests, loading]);

  useEffect(() => {
    if (counteringId !== null) counterRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [counteringId]);

  const refusalText = (err: unknown, fallback: string) => {
    // B-729 (rule 4a): a same-hour refusal names each clash, the coach's words or the student's.
    const lines = classRequestRefusalLines(err, "student", i18n.language);
    if (lines) return lines.map((line) => resolveText(t, line)).join("\n");
    const refusal = classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : fallback;
  };

  const act = async (id: number, fn: () => Promise<unknown>, okKey: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: t(okKey) });
      setCounteringId(null);
    } catch (err) {
      toast({ variant: "destructive", title: t("classRequests.decideFailed"), description: refusalText(err, "") || undefined });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  // Rule 17: the student withdraws her own pending academy request, as the class sheet does.
  const handleAcademyWithdraw = async (row: ClassJoinRequestListRow) => {
    setBusyJoinId(row.id);
    try {
      await withdrawClassJoinRequest(row.id);
      toast({ title: t("calendar.joinRequest.withdrawn") });
    } catch {
      toast({ title: t("calendar.joinRequest.decideFailed"), variant: "destructive" });
    } finally {
      setBusyJoinId(null);
      await refresh();
    }
  };

  const merged = useMemo(
    () => mergeClassRequestRows(requests, joinRequests, waitingRows),
    [requests, joinRequests, waitingRows],
  );
  const { open, closed } = useMemo(() => splitClassRequestRows(merged), [merged]);

  const renderRow = (r: ClassRequest) => {
    const who = t("classRequests.with", { name: r.coachName });
    const statusKey = `classRequests.status.${r.status}`;
    const busy = busyId === r.id;
    return (
      <div
        key={r.id}
        ref={counteringId === r.id ? counterRowRef : undefined}
        className="rounded-lg border p-3 space-y-2"
        data-testid="class-request-row"
        data-status={r.status}
        data-request-id={r.id}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              {r.date} · {r.startTime}–{r.endTime}
            </p>
            <p className="text-sm text-muted-foreground">{who}</p>
            {r.note && <p className="text-sm text-muted-foreground italic">“{r.note}”</p>}
          </div>
          <Badge variant={statusVariant(r.status)}>{t(statusKey)}</Badge>
        </div>

        {r.status === "countered" && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => act(r.id, () => answerClassRequestProposal(r.id, true), "classRequests.accepted")} data-testid="class-request-accept-proposal">
              {t("classRequests.acceptProposal")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(r.id, () => answerClassRequestProposal(r.id, false), "classRequests.answered")} data-testid="class-request-decline-proposal">
              {t("classRequests.declineProposal")}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCounteringId(counteringId === r.id ? null : r.id)} data-testid="class-request-counter">
              {t("classRequests.propose")}
            </Button>
          </div>
        )}
        {r.status === "countered" && counteringId === r.id && (
          <CounterProposalPicker
            request={r}
            busy={busy}
            onSend={(slot) => act(r.id, () => counterProposeClassRequest(r.id, slot), "classRequests.counterProposed")}
          />
        )}
        {OPEN.has(r.status) && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(r.id, () => withdrawClassRequest(r.id), "classRequests.withdrawn")} data-testid="class-request-withdraw">
            {t("classRequests.withdraw")}
          </Button>
        )}

      </div>
    );
  };

  // Rule 17: an academy row — the badge, the class it is for, its date and
  // time, and the student (coach) or nothing extra (student). No "propose
  // another time"; it exists only for private requests (rule 17, last bullet).
  const renderAcademyRow = (r: ClassJoinRequestListRow) => {
    const statusKey = `classRequests.status.${r.status}`;
    const busy = busyJoinId === r.id;
    return (
      <div
        key={`academy-${r.id}`}
        className="rounded-lg border p-3 space-y-2"
        data-testid="class-join-list-row"
        data-status={r.status}
        data-request-id={r.id}
        data-kind="academy"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" data-testid="class-join-list-kind">{t("classRequests.academyBadge")}</Badge>
              <p className="font-medium">{r.classTitle}</p>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              {r.date} · {r.startTime}–{r.endTime}
            </p>
            {r.note && <p className="text-sm text-muted-foreground italic">“{r.note}”</p>}
          </div>
          <Badge variant={statusVariant(r.status)}>{t(statusKey)}</Badge>
        </div>

        {r.status === "pending" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleAcademyWithdraw(r)} data-testid="class-join-list-withdraw">
            {t("classRequests.withdraw")}
          </Button>
        )}
      </div>
    );
  };

  // Rule 11 (PAD-504): a waiting-list place. Leaving asks once, inline, then calls rule 6's
  // leave endpoint; the row comes back from the server as `left`. Either way the list is read
  // again: a 404 means the place is already gone (left on another device), so it is no error.
  const handleLeaveWaitingList = async (r: ClassWaitingListRow) => {
    setLeavingId(r.id);
    try {
      await leaveClassWaitingList(r.lessonInstanceId);
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        toast({ variant: "destructive", title: t("classRequests.waitingList.leaveFailed") });
      }
    }
    setConfirmLeaveId(null);
    try {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["academy-classes"] });
    } finally {
      setLeavingId(null);
    }
  };

  const renderWaitingRow = (r: ClassWaitingListRow) => {
    const confirming = confirmLeaveId === r.id;
    const busy = leavingId === r.id;
    return (
      <div
        key={`waiting-${r.id}`}
        className="rounded-lg border p-3 space-y-2"
        data-testid="class-waiting-list-row"
        data-status={r.status}
        data-instance-id={r.lessonInstanceId}
        data-kind="waiting_list"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t("classRequests.academyBadge")}</Badge>
              <p className="font-medium">{r.classTitle}</p>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              {r.date} · {r.startTime}{r.endTime ? `–${r.endTime}` : ""} ·{" "}
              {t("classRequests.waitingList.withCoach", { name: r.coachName })}
            </p>
            {r.joinedAt && (
              <p className="text-xs text-muted-foreground">
                {t("classRequests.waitingList.joinedOn", { date: clubDateOfInstant(r.joinedAt) })}
              </p>
            )}
          </div>
          <Badge
            variant={r.status === "placed" ? "default" : r.status === "active" ? "secondary" : "outline"}
            data-testid="class-waiting-list-status"
          >
            {t(`classRequests.waitingList.status.${r.status}`)}
          </Badge>
        </div>
        {r.status === "active" && !confirming && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmLeaveId(r.id)} data-testid="class-waiting-list-leave">
            {t("classRequests.waitingList.leave")}
          </Button>
        )}
        {r.status === "active" && confirming && (
          <div className="flex flex-wrap items-center gap-2" data-testid="class-waiting-list-leave-confirm">
            <span className="text-sm">{t("classRequests.waitingList.leaveConfirm")}</span>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void handleLeaveWaitingList(r)} data-testid="class-waiting-list-leave-yes">
              {t("classRequests.waitingList.leaveYes")}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmLeaveId(null)}>
              {t("classRequests.waitingList.cancel")}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderMergedRow = (row: MergedClassRequestRow) =>
    row.kind === "waiting_list" ? renderWaitingRow(row) : row.kind === "academy" ? renderAcademyRow(row) : renderRow(row);

  return (
    <>
      <Card data-testid="class-requests">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5" />
                {t("classRequests.title")}
              </CardTitle>
              <CardDescription>{t("classRequests.cardIntro")}</CardDescription>
            </div>
            {(
              <Button onClick={() => setBooking(true)} className="gap-2 w-full sm:w-auto sm:shrink-0" data-testid="class-request-book">
                <CalendarPlus className="w-4 h-4" />
                {t("classRequests.book")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PAD-357: "Marcar aula" opens the wizard (coach → kind → private / academy). */}
          {(
            <ClassRequestWizard open={booking} onClose={() => setBooking(false)} onDone={refresh} />
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : merged.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("classRequests.empty")}</p>
          ) : (
            <>
              {open.map(renderMergedRow)}
              {closed.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground" data-testid="class-requests-history-toggle">{t("classRequests.history")} ({closed.length})</summary>
                  <div className="mt-2 space-y-2">{closed.map(renderMergedRow)}</div>
                </details>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </>
  );
}


/**
 * Rule 10 (PAD-281): the student picks another time for a countered request —
 * the same free-block → start-time choice as booking, on the coach the request
 * is with, and with the request's own hold left out of the busy time so the
 * proposed slot itself stays pickable.
 */
function CounterProposalPicker({
  request,
  busy,
  onSend,
}: {
  request: ClassRequest;
  busy: boolean;
  onSend: (slot: { date: string; startTime: string; endTime: string }) => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(request.date);
  const [duration, setDuration] = useState<number>(() => {
    const [sh, sm] = request.startTime.split(":").map(Number);
    const [eh, em] = request.endTime.split(":").map(Number);
    const len = eh * 60 + em - (sh * 60 + sm);
    return (CLASS_REQUEST_DURATIONS as readonly number[]).includes(len) ? len : 60;
  });
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const blocks = useQuery({
    queryKey: queryKeys.classRequestFreeBlocks(request.coachId, date, request.id),
    queryFn: () => getFreeBlocks(request.coachId, `${date}T00:00:00`, `${date}T23:59:00`, request.id),
    enabled: !!date,
  });
  useEffect(() => setSlot(null), [date, duration]);
  const starts = useMemo(
    () => (blocks.data ?? []).flatMap((b) => slotOptions(b, duration)),
    [blocks.data, duration]
  );

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3" data-testid="class-request-counter-form">
      <Label className="text-xs">{t("classRequests.pickAnotherTime")}</Label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("classRequests.date")}</Label>
          <Input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} data-testid="class-request-counter-date" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("classRequests.duration")}</Label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger aria-label={t("classRequests.duration")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASS_REQUEST_DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>{t("classRequests.minutes", { count: d })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {blocks.data && blocks.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("classRequests.noFreeBlocks")}</p>
      )}
      {starts.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="class-request-counter-slots">
          {starts.map((s) => (
            <button
              key={s.startTime}
              type="button"
              onClick={() => setSlot(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                slot?.startTime === s.startTime ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              )}
              data-testid="class-request-counter-slot"
            >
              {s.startTime}
            </button>
          ))}
        </div>
      )}
      <Button size="sm" disabled={busy || !slot} onClick={() => slot && onSend({ date, ...slot })} data-testid="class-request-counter-send">
        {t("classRequests.proposeSend")}
      </Button>
    </div>
  );
}
