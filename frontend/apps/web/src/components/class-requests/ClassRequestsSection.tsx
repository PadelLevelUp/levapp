/**
 * classes.class-requests (PAD-104). One section, two roles:
 * - student: "Marcar aula" opens the PAD-357 wizard, and their own requests, with withdraw / answer a
 *   proposal — accept, decline, or propose another time (rule 10, PAD-281);
 * - coach: every request addressed to them, with accept / decline / propose
 *   another time.
 * Free time is the coach's calendar minus what is on it (rule 1); the slot is
 * held on the coach's calendar while the request is open (rule 3).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@levelup/hooks";
import { CalendarPlus, Clock } from "lucide-react";
import type { ClassJoinRequestListRow, ClassRequest, EligibilityCheckEntry } from "@levelup/types";
import {
  CLASS_REQUEST_DURATIONS,
  clubTodayISO,
  mergeClassRequestRows,
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
import { EligibilityConfirmDialog } from "@/components/calendar/EligibilityConfirmDialog";
import { cn } from "@/lib/utils";
import {
  acceptClassRequest,
  answerClassRequestProposal,
  classRequestRefusal,
  counterProposeClassRequest,
  declineClassRequest,
  getFreeBlocks,
  listClassRequests,
  proposeClassRequest,
  withdrawClassRequest,
} from "@/api/classRequests";
import {
  acceptClassJoinRequest,
  joinRequestRefusal,
  listClassJoinRequests,
  rejectClassJoinRequest,
  withdrawClassJoinRequest,
} from "@/api/classJoinRequests";

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

export function ClassRequestsSection({ role }: { role: "student" | "coach" }) {
  const { t } = useTranslation();
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
  const loading = requestsQuery.isPending || joinRequestsQuery.isPending;
  const [busyId, setBusyId] = useState<number | null>(null);
  // A separate busy key: academy join-request ids are their own id space, never
  // compared against a private request's.
  const [busyJoinId, setBusyJoinId] = useState<number | null>(null);
  // Rule 7: accepting an academy row is a manual add — the same named-reason
  // confirmation the class sheet asks (ClassDetailSheet, EligibilityConfirmDialog).
  const [pendingAcademyAccept, setPendingAcademyAccept] = useState<{
    id: number;
    playerName: string;
    ineligible: EligibilityCheckEntry[];
  } | null>(null);
  const [proposingId, setProposingId] = useState<number | null>(null);
  const [proposal, setProposal] = useState({ date: "", startTime: "10:00", endTime: "11:00" });
  // Rule 10: the student's "propose another time" picker, opened from the row or
  // from the chat bubble (`?proposeFor=<id>`).
  const [counteringId, setCounteringId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const counterRowRef = useRef<HTMLDivElement | null>(null);

  // Student booking flow: the PAD-357 wizard (its steps own their state).
  const [booking, setBooking] = useState(false);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.classRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classJoinRequests }),
      // The class sheet's own read, wherever it is cached — an academy decision
      // made from this list must not leave it stale.
      queryClient.invalidateQueries({ queryKey: ["class-instance"] }),
    ]);
  };

  useEffect(() => {
    if (requestsQuery.isError || joinRequestsQuery.isError) {
      toast({ variant: "destructive", title: t("classRequests.loadFailed") });
    }
  }, [requestsQuery.isError, joinRequestsQuery.isError, t, toast]);

  // `?proposeFor=<id>` comes from the chat bubble's "Propose another time":
  // the student's picker on a countered request, the coach's form on a pending one.
  useEffect(() => {
    const wanted = Number(searchParams.get("proposeFor"));
    if (!wanted || loading) return;
    const row = requests.find((r) => r.id === wanted);
    if (row && role === "student" && row.status === "countered") setCounteringId(wanted);
    if (row && role === "coach" && row.status === "pending") {
      setProposingId(wanted);
      setProposal({ date: row.date, startTime: row.startTime, endTime: row.endTime });
    }
    searchParams.delete("proposeFor");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, requests, loading, role]);

  useEffect(() => {
    if (counteringId !== null || proposingId !== null) counterRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [counteringId, proposingId]);

  const refusalText = (err: unknown, fallback: string) => {
    const refusal = classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : fallback;
  };

  const act = async (id: number, fn: () => Promise<unknown>, okKey: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: t(okKey) });
      setProposingId(null);
      setCounteringId(null);
    } catch (err) {
      toast({ variant: "destructive", title: t("classRequests.decideFailed"), description: refusalText(err, "") || undefined });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  // Rule 17: the academy row's decision mirrors ClassDetailSheet's
  // handleDecideJoinRequest/handleWithdrawJoinRequest exactly, so refusals and
  // toasts read the same from the list as from the class sheet.
  const handleAcademyAccept = async (row: ClassJoinRequestListRow, confirm = false) => {
    setBusyJoinId(row.id);
    try {
      await acceptClassJoinRequest(row.id, confirm);
      toast({ title: t("calendar.joinRequest.acceptedToast", { name: row.playerName }) });
    } catch (err) {
      const refusal = joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setBusyJoinId(null);
        setPendingAcademyAccept({ id: row.id, playerName: row.playerName, ineligible: refusal.ineligible ?? [] });
        return;
      }
      toast({
        title:
          refusal?.code === "spot_filled"
            ? t("calendar.joinRequest.spotFilledToast")
            : refusal?.code === "class_closed"
              ? t("calendar.joinRequest.classClosedToast")
              : t("calendar.joinRequest.decideFailed"),
        variant: "destructive",
      });
    } finally {
      setBusyJoinId(null);
      await refresh();
    }
  };

  const handleAcademyReject = async (row: ClassJoinRequestListRow) => {
    setBusyJoinId(row.id);
    try {
      await rejectClassJoinRequest(row.id);
      toast({ title: t("calendar.joinRequest.rejectedToast", { name: row.playerName }) });
    } catch {
      toast({ title: t("calendar.joinRequest.decideFailed"), variant: "destructive" });
    } finally {
      setBusyJoinId(null);
      await refresh();
    }
  };

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

  const merged = useMemo(() => mergeClassRequestRows(requests, joinRequests), [requests, joinRequests]);
  const { open, closed } = useMemo(() => splitClassRequestRows(merged), [merged]);

  const renderRow = (r: ClassRequest) => {
    const who = role === "student" ? t("classRequests.with", { name: r.coachName }) : t("classRequests.from", { name: r.playerName });
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
    const busy = busyId === r.id;
    return (
      <div
        key={r.id}
        ref={counteringId === r.id || proposingId === r.id ? counterRowRef : undefined}
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

        {role === "student" && r.status === "countered" && (
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
        {role === "student" && r.status === "countered" && counteringId === r.id && (
          <CounterProposalPicker
            request={r}
            busy={busy}
            onSend={(slot) => act(r.id, () => counterProposeClassRequest(r.id, slot), "classRequests.counterProposed")}
          />
        )}
        {role === "student" && OPEN.has(r.status) && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(r.id, () => withdrawClassRequest(r.id), "classRequests.withdrawn")} data-testid="class-request-withdraw">
            {t("classRequests.withdraw")}
          </Button>
        )}

        {role === "coach" && r.status === "pending" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => act(r.id, () => acceptClassRequest(r.id), "classRequests.accepted")} data-testid="class-request-accept">
                {t("classRequests.accept")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(r.id, () => declineClassRequest(r.id), "classRequests.declined")} data-testid="class-request-decline">
                {t("classRequests.decline")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setProposingId(proposingId === r.id ? null : r.id);
                  setProposal({ date: r.date, startTime: r.startTime, endTime: r.endTime });
                }}
                data-testid="class-request-propose"
              >
                {t("classRequests.propose")}
              </Button>
            </div>
            {proposingId === r.id && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end rounded-md bg-muted/40 p-2" data-testid="class-request-proposal-form">
                <div className="space-y-1">
                  <Label className="text-xs">{t("classRequests.date")}</Label>
                  <Input type="date" min={todayIso()} value={proposal.date} onChange={(e) => setProposal((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("availability.startTime")}</Label>
                  <Input type="time" value={proposal.startTime} onChange={(e) => setProposal((p) => ({ ...p, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("availability.endTime")}</Label>
                  <Input type="time" value={proposal.endTime} onChange={(e) => setProposal((p) => ({ ...p, endTime: e.target.value }))} />
                </div>
                <Button size="sm" disabled={busy || !proposal.date} onClick={() => act(r.id, () => proposeClassRequest(r.id, proposal), "classRequests.proposed")} data-testid="class-request-propose-send">
                  {t("classRequests.proposeSend")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Rule 17: an academy row — the badge, the class it is for, its date and
  // time, and the student (coach) or nothing extra (student). No "propose
  // another time"; it exists only for private requests (rule 17, last bullet).
  const renderAcademyRow = (r: ClassJoinRequestListRow) => {
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
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
            {role === "coach" && <p className="text-sm text-muted-foreground">{r.playerName}</p>}
            {r.note && <p className="text-sm text-muted-foreground italic">“{r.note}”</p>}
          </div>
          <Badge variant={statusVariant(r.status)}>{t(statusKey)}</Badge>
        </div>

        {role === "coach" && r.status === "pending" && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => handleAcademyAccept(r)} data-testid="class-join-list-accept">
              {t("calendar.joinRequest.accept")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => handleAcademyReject(r)} data-testid="class-join-list-reject">
              {t("calendar.joinRequest.reject")}
            </Button>
          </div>
        )}
        {role === "student" && r.status === "pending" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleAcademyWithdraw(r)} data-testid="class-join-list-withdraw">
            {t("classRequests.withdraw")}
          </Button>
        )}
      </div>
    );
  };

  const renderMergedRow = (row: MergedClassRequestRow) => (row.kind === "academy" ? renderAcademyRow(row) : renderRow(row));

  return (
    <>
      <Card data-testid="class-requests">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5" />
                {t(role === "student" ? "classRequests.title" : "classRequests.coachTitle")}
              </CardTitle>
              <CardDescription>{t(role === "student" ? "classRequests.cardIntro" : "classRequests.coachIntro")}</CardDescription>
            </div>
            {role === "student" && (
              <Button onClick={() => setBooking(true)} className="gap-2 w-full sm:w-auto sm:shrink-0" data-testid="class-request-book">
                <CalendarPlus className="w-4 h-4" />
                {t("classRequests.book")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PAD-357: "Marcar aula" opens the wizard (coach → kind → private / academy). */}
          {role === "student" && (
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

      {/* Rule 7: accepting an academy row is a manual add — same warning as the class sheet. */}
      <EligibilityConfirmDialog
        open={pendingAcademyAccept !== null}
        ineligible={pendingAcademyAccept?.ineligible ?? []}
        onCancel={() => setPendingAcademyAccept(null)}
        onConfirm={() => {
          const parked = pendingAcademyAccept;
          setPendingAcademyAccept(null);
          if (parked) void handleAcademyAccept({ id: parked.id, playerName: parked.playerName } as ClassJoinRequestListRow, true);
        }}
      />
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
