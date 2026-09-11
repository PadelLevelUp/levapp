/**
 * classes.class-requests (PAD-104). One section, two roles:
 * - student: "Book a class" (coach → date → duration → a free block → a start
 *   time → note → send) and their own requests, with withdraw / answer a
 *   proposal;
 * - coach: every request addressed to them, with accept / decline / propose
 *   another time.
 * Free time is the coach's calendar minus what is on it (rule 1); the slot is
 * held on the coach's calendar while the request is open (rule 3).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarPlus, Clock } from "lucide-react";
import type { ClassRequest, FreeBlock } from "@levelup/types";
import { CLASS_REQUEST_DURATIONS, clubTodayISO, slotOptions } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  acceptClassRequest,
  answerClassRequestProposal,
  classRequestRefusal,
  createClassRequest,
  declineClassRequest,
  getFreeBlocks,
  listClassRequestCoaches,
  listClassRequests,
  proposeClassRequest,
  withdrawClassRequest,
  type ClassRequestCoach,
} from "@/api/classRequests";

const OPEN = new Set(["pending", "countered"]);

function todayIso(): string {
  return clubTodayISO(); // B-060: the club's date, not the device's
}

function statusVariant(status: ClassRequest["status"]): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "declined") return "destructive";
  if (status === "withdrawn") return "outline";
  return "secondary";
}

export function ClassRequestsSection({ role }: { role: "student" | "coach" }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ClassRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [proposingId, setProposingId] = useState<number | null>(null);
  const [proposal, setProposal] = useState({ date: "", startTime: "10:00", endTime: "11:00" });

  // Student booking flow
  const [booking, setBooking] = useState(false);
  const [coaches, setCoaches] = useState<ClassRequestCoach[]>([]);
  const [coachId, setCoachId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [duration, setDuration] = useState<number>(60);
  const [blocks, setBlocks] = useState<FreeBlock[] | null>(null);
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRequests(await listClassRequests());
    } catch {
      toast({ variant: "destructive", title: t("classRequests.loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (role !== "student" || !booking) return;
    listClassRequestCoaches()
      .then((rows) => {
        setCoaches(rows);
        if (rows.length === 1) setCoachId(rows[0].id);
      })
      .catch(() => setCoaches([]));
  }, [role, booking]);

  useEffect(() => {
    if (!booking || !coachId || !date) {
      setBlocks(null);
      return;
    }
    let cancelled = false;
    setSlot(null);
    getFreeBlocks(coachId, `${date}T00:00:00`, `${date}T23:59:00`)
      .then((rows) => {
        if (!cancelled) setBlocks(rows);
      })
      .catch(() => {
        if (!cancelled) setBlocks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [booking, coachId, date]);

  const starts = useMemo(
    () => (blocks ?? []).flatMap((b) => slotOptions(b, duration).map((s) => ({ ...s, block: b }))),
    [blocks, duration]
  );

  const refusalText = (err: unknown, fallback: string) => {
    const refusal = classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : fallback;
  };

  const send = async () => {
    if (!coachId || !slot) return;
    setSending(true);
    try {
      await createClassRequest({ coachId, date, startTime: slot.startTime, endTime: slot.endTime, note: note.trim() || null });
      toast({ title: t("classRequests.sent"), description: t("classRequests.sentBody") });
      setBooking(false);
      setSlot(null);
      setNote("");
      await refresh();
    } catch (err) {
      toast({ variant: "destructive", title: t("classRequests.failed"), description: refusalText(err, "") || undefined });
      // The block list may be stale — reload it.
      if (coachId && date) getFreeBlocks(coachId, `${date}T00:00:00`, `${date}T23:59:00`).then(setBlocks).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const act = async (id: number, fn: () => Promise<unknown>, okKey: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: t(okKey) });
      setProposingId(null);
    } catch (err) {
      toast({ variant: "destructive", title: t("classRequests.decideFailed"), description: refusalText(err, "") || undefined });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  const open = requests.filter((r) => OPEN.has(r.status));
  const closed = requests.filter((r) => !OPEN.has(r.status));

  const renderRow = (r: ClassRequest) => {
    const who = role === "student" ? t("classRequests.with", { name: r.coachName }) : t("classRequests.from", { name: r.playerName });
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
    const busy = busyId === r.id;
    return (
      <div key={r.id} className="rounded-lg border p-3 space-y-2" data-testid="class-request-row" data-status={r.status}>
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
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(r.id, () => answerClassRequestProposal(r.id, false), "classRequests.answered")}>
              {t("classRequests.declineProposal")}
            </Button>
          </div>
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

  return (
    <Card data-testid="class-requests">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5" />
              {t(role === "student" ? "classRequests.title" : "classRequests.coachTitle")}
            </CardTitle>
            <CardDescription>{t(role === "student" ? "classRequests.intro" : "classRequests.coachIntro")}</CardDescription>
          </div>
          {role === "student" && !booking && (
            <Button onClick={() => setBooking(true)} className="gap-2 w-full sm:w-auto sm:shrink-0" data-testid="class-request-book">
              <CalendarPlus className="w-4 h-4" />
              {t("classRequests.book")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {role === "student" && booking && (
          <div className="rounded-lg border p-3 space-y-4" data-testid="class-request-form">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("classRequests.coach")}</Label>
                <Select value={coachId} onValueChange={setCoachId}>
                  <SelectTrigger data-testid="class-request-coach" aria-label={t("classRequests.coach")}>
                    <SelectValue placeholder={t("classRequests.selectCoach")} />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {coaches.length === 0 && <p className="text-xs text-muted-foreground">{t("classRequests.noCoaches")}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-request-date">{t("classRequests.date")}</Label>
                <Input id="class-request-date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} data-testid="class-request-date" />
              </div>
              <div className="space-y-2">
                <Label>{t("classRequests.duration")}</Label>
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

            {coachId && blocks && (
              <div className="space-y-2">
                <Label>{t("classRequests.freeBlocks")}</Label>
                {blocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("classRequests.noFreeBlocks")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" data-testid="class-request-free-blocks">
                    {blocks.map((b) => (
                      <Badge key={`${b.startTime}-${b.endTime}`} variant="outline">{b.startTime}–{b.endTime}</Badge>
                    ))}
                  </div>
                )}
                {starts.length > 0 && (
                  <>
                    <Label className="text-xs">{t("classRequests.pickStart")}</Label>
                    <div className="flex flex-wrap gap-1.5" data-testid="class-request-slots">
                      {starts.map((s) => (
                        <button
                          key={s.startTime}
                          type="button"
                          onClick={() => setSlot({ startTime: s.startTime, endTime: s.endTime })}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            slot?.startTime === s.startTime ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                          )}
                          data-testid="class-request-slot"
                        >
                          {s.startTime}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="class-request-note">{t("classRequests.note")}</Label>
              <Textarea id="class-request-note" rows={2} placeholder={t("classRequests.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBooking(false)} disabled={sending}>{t("classRequests.cancel")}</Button>
              <Button onClick={send} disabled={sending || !coachId || !slot} data-testid="class-request-send">{t("classRequests.send")}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("classRequests.empty")}</p>
        ) : (
          <>
            {open.map(renderRow)}
            {closed.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("classRequests.history")} ({closed.length})</summary>
                <div className="mt-2 space-y-2">{closed.map(renderRow)}</div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
