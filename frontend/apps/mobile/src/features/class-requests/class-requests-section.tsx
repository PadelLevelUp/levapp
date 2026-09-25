/**
 * classes.class-requests (PAD-104) — mirrors web's ClassRequestsSection:
 * student opens the "Marcar aula" wizard (PAD-357, app/class-request-wizard.tsx) and manages their own
 * requests (withdraw, or answer a proposal: accept / decline / propose another
 * time — rule 10, PAD-281); coach accepts / declines / proposes another time.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  CLASS_REQUEST_DURATIONS,
  clubTodayISO,
  lightTheme,
  mergeClassRequestRows,
  slotOptions,
  splitClassRequestRows,
  type MergedClassRequestRow,
} from "@levelup/config";
import { queryKeys } from "@levelup/hooks";
import type { ClassJoinRequestListRow, ClassRequest, EligibilityCheckEntry } from "@levelup/types";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import * as classJoinRequestsApi from "@levelup/api/src/resources/classJoinRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type Option } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { EligibilityConfirmDialog } from "@/features/calendar/eligibility-confirm-dialog";

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

export function ClassRequestsSection({
  role,
  proposeFor,
}: {
  role: "student" | "coach";
  /** Rule 10: open the "propose another time" picker on this request (from the chat bubble). */
  proposeFor?: number | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: queryKeys.classRequests, queryFn: classRequestsApi.listClassRequests });
  // classes.join-requests rule 17 (PAD-460): academy requests, shown beside the
  // private ones above, merged newest first (`@levelup/config`, shared with web).
  const joinRequests = useQuery({ queryKey: queryKeys.classJoinRequests, queryFn: classJoinRequestsApi.listClassJoinRequests });
  const invalidate = () =>
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.classRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classJoinRequests }),
      // The class detail's own read, wherever it is cached — an academy decision
      // made from this list must not leave it stale.
      queryClient.invalidateQueries({ queryKey: ["class-instance"] }),
    ]);

  const [proposingId, setProposingId] = React.useState<number | null>(null);
  const [proposal, setProposal] = React.useState({ date: "", startTime: "10:00", endTime: "11:00" });
  const [counteringId, setCounteringId] = React.useState<number | null>(null);
  // From the chat bubble's "Propose another time": the student's picker on a
  // countered request, the coach's form on a pending one.
  React.useEffect(() => {
    if (proposeFor == null || !requests.data) return;
    const row = requests.data.find((r) => r.id === proposeFor);
    if (row && role === "student" && row.status === "countered") setCounteringId(proposeFor);
    if (row && role === "coach" && row.status === "pending") {
      setProposingId(proposeFor);
      setProposal({ date: row.date, startTime: row.startTime, endTime: row.endTime });
    }
  }, [proposeFor, role, requests.data]);

  const refusalText = (err: unknown, fallback: string) => {
    const refusal = classRequestsApi.classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : fallback;
  };

  const act = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; okKey: string }) => fn(),
    onSuccess: (_data, vars) => {
      toast.success(t(vars.okKey));
      setProposingId(null);
      setCounteringId(null);
    },
    onError: (err) => toast.error(refusalText(err, t("classRequests.decideFailed"))),
    onSettled: () => invalidate(),
  });

  // Rule 17: the academy row's decision mirrors class/[id].tsx's
  // handleDecideJoinRequest/handleWithdrawJoinRequest exactly, so refusals and
  // toasts read the same from the list as from the class detail screen.
  const [busyJoinId, setBusyJoinId] = React.useState<number | null>(null);
  const [pendingAcademyAccept, setPendingAcademyAccept] = React.useState<{
    id: number;
    playerName: string;
    ineligible: EligibilityCheckEntry[];
  } | null>(null);

  const handleAcademyAccept = async (row: ClassJoinRequestListRow, confirm = false) => {
    setBusyJoinId(row.id);
    try {
      await classJoinRequestsApi.acceptClassJoinRequest(row.id, confirm);
      toast.success(t("calendar.joinRequest.acceptedToast", { name: row.playerName }));
    } catch (err) {
      const refusal = classJoinRequestsApi.joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setBusyJoinId(null);
        setPendingAcademyAccept({ id: row.id, playerName: row.playerName, ineligible: refusal.ineligible ?? [] });
        return;
      }
      toast.error(
        refusal?.code === "spot_filled"
          ? t("calendar.joinRequest.spotFilledToast")
          : refusal?.code === "class_closed"
            ? t("calendar.joinRequest.classClosedToast")
            : t("calendar.joinRequest.decideFailed")
      );
    } finally {
      setBusyJoinId(null);
      invalidate();
    }
  };

  const handleAcademyReject = async (row: ClassJoinRequestListRow) => {
    setBusyJoinId(row.id);
    try {
      await classJoinRequestsApi.rejectClassJoinRequest(row.id);
      toast.success(t("calendar.joinRequest.rejectedToast", { name: row.playerName }));
    } catch {
      toast.error(t("calendar.joinRequest.decideFailed"));
    } finally {
      setBusyJoinId(null);
      invalidate();
    }
  };

  const handleAcademyWithdraw = async (row: ClassJoinRequestListRow) => {
    setBusyJoinId(row.id);
    try {
      await classJoinRequestsApi.withdrawClassJoinRequest(row.id);
      toast.success(t("calendar.joinRequest.withdrawn"));
    } catch {
      toast.error(t("calendar.joinRequest.decideFailed"));
    } finally {
      setBusyJoinId(null);
      invalidate();
    }
  };

  const merged = React.useMemo(
    () => mergeClassRequestRows(requests.data ?? [], joinRequests.data ?? []),
    [requests.data, joinRequests.data]
  );
  const { open, closed } = React.useMemo(() => splitClassRequestRows(merged), [merged]);
  const [showClosed, setShowClosed] = React.useState(false);

  const renderRow = (r: ClassRequest) => {
    const who = role === "student" ? t("classRequests.with", { name: r.coachName }) : t("classRequests.from", { name: r.playerName });
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
    const busy = act.isPending;
    return (
      <View key={r.id} className="gap-2 rounded-lg border border-border bg-card p-3" testID={`class-request-row-${r.status}`}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text className="font-medium">
              {r.date} · {r.startTime}–{r.endTime}
            </Text>
            <Text className="text-sm text-muted-foreground">{who}</Text>
            {r.note ? <Text className="text-sm italic text-muted-foreground">“{r.note}”</Text> : null}
          </View>
          <Badge variant={statusVariant(r.status)}>
            <Text>{t(statusKey)}</Text>
          </Badge>
        </View>

        {role === "student" && r.status === "countered" ? (
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.answerClassRequestProposal(r.id, true), okKey: "classRequests.accepted" })} testID="class-request-accept-proposal">
              <Text>{t("classRequests.acceptProposal")}</Text>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.answerClassRequestProposal(r.id, false), okKey: "classRequests.answered" })} testID="class-request-decline-proposal">
              <Text>{t("classRequests.declineProposal")}</Text>
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onPress={() => setCounteringId(counteringId === r.id ? null : r.id)} testID="class-request-counter">
              <Text>{t("classRequests.propose")}</Text>
            </Button>
          </View>
        ) : null}
        {role === "student" && r.status === "countered" && counteringId === r.id ? (
          <CounterProposalPicker
            request={r}
            busy={busy}
            onSend={(s) => act.mutate({ fn: () => classRequestsApi.counterProposeClassRequest(r.id, s), okKey: "classRequests.counterProposed" })}
          />
        ) : null}
        {role === "student" && OPEN.has(r.status) ? (
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.withdrawClassRequest(r.id), okKey: "classRequests.withdrawn" })} testID="class-request-withdraw">
            <Text>{t("classRequests.withdraw")}</Text>
          </Button>
        ) : null}

        {role === "coach" && r.status === "pending" ? (
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.acceptClassRequest(r.id), okKey: "classRequests.accepted" })} testID="class-request-accept">
                <Text>{t("classRequests.accept")}</Text>
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.declineClassRequest(r.id), okKey: "classRequests.declined" })} testID="class-request-decline">
                <Text>{t("classRequests.decline")}</Text>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  setProposingId(proposingId === r.id ? null : r.id);
                  setProposal({ date: r.date, startTime: r.startTime, endTime: r.endTime });
                }}
                testID="class-request-propose"
              >
                <Text>{t("classRequests.propose")}</Text>
              </Button>
            </View>
            {proposingId === r.id ? (
              <View className="gap-2 rounded-md bg-muted/40 p-2">
                <DatePickerInput testID="class-request-proposal-date" label={t("classRequests.date")} value={proposal.date} onChange={(v) => setProposal((p) => ({ ...p, date: v }))} />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <TimePickerInput testID="class-request-proposal-start" label={t("availability.startTime")} value={proposal.startTime} onChange={(v) => setProposal((p) => ({ ...p, startTime: v }))} />
                  </View>
                  <View className="flex-1">
                    <TimePickerInput testID="class-request-proposal-end" label={t("availability.endTime")} value={proposal.endTime} onChange={(v) => setProposal((p) => ({ ...p, endTime: v }))} />
                  </View>
                </View>
                <Button size="sm" disabled={busy || !proposal.date} onPress={() => act.mutate({ fn: () => classRequestsApi.proposeClassRequest(r.id, proposal), okKey: "classRequests.proposed" })} testID="class-request-propose-send">
                  <Text>{t("classRequests.proposeSend")}</Text>
                </Button>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  // Rule 17: an academy row — the badge, the class it is for, its date and
  // time, and the student (coach) or nothing extra (student). No "propose
  // another time"; it exists only for private requests (rule 17, last bullet).
  const renderAcademyRow = (r: ClassJoinRequestListRow) => {
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
    const busy = busyJoinId === r.id;
    return (
      <View key={`academy-${r.id}`} className="gap-2 rounded-lg border border-border bg-card p-3" testID={`class-join-list-row-${r.status}`}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge variant="outline" testID="class-join-list-kind">
                <Text>{t("classRequests.academyBadge")}</Text>
              </Badge>
              <Text className="font-medium">{r.classTitle}</Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {r.date} · {r.startTime}–{r.endTime}
            </Text>
            {role === "coach" ? <Text className="text-sm text-muted-foreground">{r.playerName}</Text> : null}
            {r.note ? <Text className="text-sm italic text-muted-foreground">“{r.note}”</Text> : null}
          </View>
          <Badge variant={statusVariant(r.status)}>
            <Text>{t(statusKey)}</Text>
          </Badge>
        </View>

        {role === "coach" && r.status === "pending" ? (
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" disabled={busy} onPress={() => handleAcademyAccept(r)} testID="class-join-list-accept">
              <Text>{t("calendar.joinRequest.accept")}</Text>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onPress={() => handleAcademyReject(r)} testID="class-join-list-reject">
              <Text>{t("calendar.joinRequest.reject")}</Text>
            </Button>
          </View>
        ) : null}
        {role === "student" && r.status === "pending" ? (
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => handleAcademyWithdraw(r)} testID="class-join-list-withdraw">
            <Text>{t("classRequests.withdraw")}</Text>
          </Button>
        ) : null}
      </View>
    );
  };

  const renderMergedRow = (row: MergedClassRequestRow) => (row.kind === "academy" ? renderAcademyRow(row) : renderRow(row));

  const loading = requests.isPending || joinRequests.isPending;
  const loadFailed = requests.isError || joinRequests.isError;

  return (
    <>
      <Card testID="class-requests">
        <CardContent className="gap-4 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold">{t(role === "student" ? "classRequests.title" : "classRequests.coachTitle")}</Text>
              <Text className="text-xs text-muted-foreground">{t(role === "student" ? "classRequests.cardIntro" : "classRequests.coachIntro")}</Text>
            </View>
            {role === "student" ? (
              <Button size="sm" onPress={() => router.push("/class-request-wizard")} testID="class-request-book">
                <Text>{t("classRequests.book")}</Text>
              </Button>
            ) : null}
          </View>

          {loading ? (
            <Text className="text-sm text-muted-foreground">…</Text>
          ) : loadFailed ? (
            <Text className="text-sm text-destructive">{t("classRequests.loadFailed")}</Text>
          ) : merged.length === 0 ? (
            <Text className="text-sm text-muted-foreground">{t("classRequests.empty")}</Text>
          ) : (
            <View className="gap-2">
              {open.map(renderMergedRow)}
              {closed.length > 0 ? (
                <View className="gap-2">
                  <Pressable onPress={() => setShowClosed((v) => !v)} className="flex-row items-center gap-1 py-1">
                    <Ionicons name={showClosed ? "chevron-down" : "chevron-forward"} size={14} color={lightTheme.mutedForeground} />
                    <Text className="text-sm text-muted-foreground">
                      {t("classRequests.history")} ({closed.length})
                    </Text>
                  </Pressable>
                  {showClosed ? closed.map(renderMergedRow) : null}
                </View>
              ) : null}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Rule 7: accepting an academy row is a manual add — same warning as the class detail screen. */}
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
 * Rule 10 (PAD-281) — mirrors web's CounterProposalPicker: the student picks
 * another time for a countered request from the coach's free blocks, with the
 * request's own hold left out of the busy time.
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
  const [date, setDate] = React.useState(request.date);
  const initialLen = React.useMemo(() => {
    const [sh, sm] = request.startTime.split(":").map(Number);
    const [eh, em] = request.endTime.split(":").map(Number);
    const len = eh * 60 + em - (sh * 60 + sm);
    return (CLASS_REQUEST_DURATIONS as readonly number[]).includes(len) ? len : 60;
  }, [request.startTime, request.endTime]);
  const [duration, setDuration] = React.useState<Option>({ value: String(initialLen), label: t("classRequests.minutes", { count: initialLen }) });
  const [slot, setSlot] = React.useState<{ startTime: string; endTime: string } | null>(null);
  const durationMin = Number(duration?.value ?? 60);
  const blocks = useQuery({
    queryKey: queryKeys.classRequestFreeBlocks(request.coachId, date, request.id),
    queryFn: () => classRequestsApi.getFreeBlocks(request.coachId, `${date}T00:00:00`, `${date}T23:59:00`, request.id),
    enabled: !!date,
  });
  React.useEffect(() => setSlot(null), [date, durationMin]);
  const starts = React.useMemo(
    () => (blocks.data ?? []).flatMap((b) => slotOptions(b, durationMin)),
    [blocks.data, durationMin]
  );

  return (
    <View className="gap-3 rounded-md bg-muted/40 p-3" testID="class-request-counter-form">
      <Label>{t("classRequests.pickAnotherTime")}</Label>
      <DatePickerInput testID="class-request-counter-date" label={t("classRequests.date")} value={date} onChange={setDate} />
      <View className="gap-2">
        <Label>{t("classRequests.duration")}</Label>
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger accessibilityLabel={t("classRequests.duration")}>
            <SelectValue placeholder={t("classRequests.duration")} />
          </SelectTrigger>
          <SelectContent>
            {CLASS_REQUEST_DURATIONS.map((d) => (
              <SelectItem key={d} value={String(d)} label={t("classRequests.minutes", { count: d })} />
            ))}
          </SelectContent>
        </Select>
      </View>
      {blocks.data && blocks.data.length === 0 ? (
        <Text className="text-sm text-muted-foreground">{t("classRequests.noFreeBlocks")}</Text>
      ) : null}
      {starts.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5" testID="class-request-counter-slots">
          {starts.map((s) => {
            const selected = slot?.startTime === s.startTime;
            return (
              <Pressable
                key={s.startTime}
                onPress={() => setSlot(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={cn("rounded-full border px-3 py-1.5", selected ? "border-primary bg-primary" : "border-border bg-background")}
                testID="class-request-counter-slot"
              >
                <Text className={cn("text-sm", selected && "text-primary-foreground")}>{s.startTime}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Button size="sm" disabled={busy || !slot} onPress={() => slot && onSend({ date, ...slot })} testID="class-request-counter-send">
        <Text>{t("classRequests.proposeSend")}</Text>
      </Button>
    </View>
  );
}
