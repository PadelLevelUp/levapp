/**
 * classes.class-requests (PAD-104) — mirrors web's ClassRequestsSection:
 * student books a class in the coach's free time and manages their own
 * requests; coach accepts / declines / proposes another time.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CLASS_REQUEST_DURATIONS, clubTodayISO, lightTheme, slotOptions } from "@levelup/config";
import { queryKeys } from "@levelup/hooks";
import type { ClassRequest } from "@levelup/types";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type Option } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: queryKeys.classRequests, queryFn: classRequestsApi.listClassRequests });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.classRequests });

  const [booking, setBooking] = React.useState(false);
  const [coach, setCoach] = React.useState<Option>(undefined);
  const [date, setDate] = React.useState(todayIso());
  const [duration, setDuration] = React.useState<Option>({ value: "60", label: t("classRequests.minutes", { count: 60 }) });
  const [slot, setSlot] = React.useState<{ startTime: string; endTime: string } | null>(null);
  const [note, setNote] = React.useState("");
  const [proposingId, setProposingId] = React.useState<number | null>(null);
  const [proposal, setProposal] = React.useState({ date: "", startTime: "10:00", endTime: "11:00" });

  const coaches = useQuery({
    queryKey: queryKeys.classRequestCoaches,
    queryFn: classRequestsApi.listClassRequestCoaches,
    enabled: role === "student" && booking,
  });
  React.useEffect(() => {
    if (coaches.data?.length === 1 && !coach) setCoach({ value: coaches.data[0].id, label: coaches.data[0].name });
  }, [coaches.data, coach]);

  const coachId = coach?.value ?? "";
  const blocks = useQuery({
    queryKey: queryKeys.classRequestFreeBlocks(coachId, date),
    queryFn: () => classRequestsApi.getFreeBlocks(coachId, `${date}T00:00:00`, `${date}T23:59:00`),
    enabled: role === "student" && booking && !!coachId && !!date,
  });
  React.useEffect(() => setSlot(null), [coachId, date, duration?.value]);

  const durationMin = Number(duration?.value ?? 60);
  const starts = React.useMemo(
    () => (blocks.data ?? []).flatMap((b) => slotOptions(b, durationMin)),
    [blocks.data, durationMin]
  );

  const refusalText = (err: unknown, fallback: string) => {
    const refusal = classRequestsApi.classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : fallback;
  };

  const send = useMutation({
    mutationFn: () =>
      classRequestsApi.createClassRequest({
        coachId,
        date,
        startTime: slot!.startTime,
        endTime: slot!.endTime,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t("classRequests.sent"));
      setBooking(false);
      setSlot(null);
      setNote("");
      invalidate();
    },
    onError: (err) => {
      toast.error(refusalText(err, t("classRequests.failed")));
      void blocks.refetch();
    },
  });

  const act = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; okKey: string }) => fn(),
    onSuccess: (_data, vars) => {
      toast.success(t(vars.okKey));
      setProposingId(null);
    },
    onError: (err) => toast.error(refusalText(err, t("classRequests.decideFailed"))),
    onSettled: () => invalidate(),
  });

  const rows = requests.data ?? [];
  const open = rows.filter((r) => OPEN.has(r.status));
  const closed = rows.filter((r) => !OPEN.has(r.status));
  const [showClosed, setShowClosed] = React.useState(false);

  const renderRow = (r: ClassRequest) => {
    const who = role === "student" ? t("classRequests.with", { name: r.coachName }) : t("classRequests.from", { name: r.playerName });
    const statusKey = role === "student" ? `classRequests.status.${r.status}` : `classRequests.coachStatus.${r.status}`;
    const busy = act.isPending;
    return (
      <View key={r.id} className="gap-2 rounded-lg border border-border bg-card p-3" testID="class-request-row">
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
          <View className="flex-row gap-2">
            <Button size="sm" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.answerClassRequestProposal(r.id, true), okKey: "classRequests.accepted" })} testID="class-request-accept-proposal">
              <Text>{t("classRequests.acceptProposal")}</Text>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onPress={() => act.mutate({ fn: () => classRequestsApi.answerClassRequestProposal(r.id, false), okKey: "classRequests.answered" })}>
              <Text>{t("classRequests.declineProposal")}</Text>
            </Button>
          </View>
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

  return (
    <Card testID="class-requests">
      <CardContent className="gap-4 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold">{t(role === "student" ? "classRequests.title" : "classRequests.coachTitle")}</Text>
            <Text className="text-xs text-muted-foreground">{t(role === "student" ? "classRequests.intro" : "classRequests.coachIntro")}</Text>
          </View>
          {role === "student" && !booking ? (
            <Button size="sm" onPress={() => setBooking(true)} testID="class-request-book">
              <Text>{t("classRequests.book")}</Text>
            </Button>
          ) : null}
        </View>

        {role === "student" && booking ? (
          <View className="gap-3 rounded-lg border border-border p-3" testID="class-request-form">
            <View className="gap-2">
              <Label>{t("classRequests.coach")}</Label>
              <Select value={coach} onValueChange={setCoach}>
                <SelectTrigger testID="class-request-coach" accessibilityLabel={t("classRequests.coach")}>
                  <SelectValue placeholder={t("classRequests.selectCoach")} />
                </SelectTrigger>
                <SelectContent>
                  {(coaches.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name} />
                  ))}
                </SelectContent>
              </Select>
              {coaches.data && coaches.data.length === 0 ? (
                <Text className="text-xs text-muted-foreground">{t("classRequests.noCoaches")}</Text>
              ) : null}
            </View>
            <DatePickerInput label={t("classRequests.date")} value={date} onChange={setDate} testID="class-request-date" />
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

            {coachId && blocks.data ? (
              <View className="gap-2">
                <Label>{t("classRequests.freeBlocks")}</Label>
                {blocks.data.length === 0 ? (
                  <Text className="text-sm text-muted-foreground">{t("classRequests.noFreeBlocks")}</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-1.5">
                    {blocks.data.map((b) => (
                      <Badge key={`${b.startTime}-${b.endTime}`} variant="outline">
                        <Text>{b.startTime}–{b.endTime}</Text>
                      </Badge>
                    ))}
                  </View>
                )}
                {starts.length > 0 ? (
                  <View className="gap-1">
                    <Label>{t("classRequests.pickStart")}</Label>
                    <View className="flex-row flex-wrap gap-1.5" testID="class-request-slots">
                      {starts.map((s) => {
                        const selected = slot?.startTime === s.startTime;
                        return (
                          <Pressable
                            key={s.startTime}
                            onPress={() => setSlot(s)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            className={cn("rounded-full border px-3 py-1.5", selected ? "border-primary bg-primary" : "border-border bg-background")}
                            testID="class-request-slot"
                          >
                            <Text className={cn("text-sm", selected && "text-primary-foreground")}>{s.startTime}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View className="gap-2">
              <Label>{t("classRequests.note")}</Label>
              <Textarea value={note} onChangeText={setNote} placeholder={t("classRequests.notePlaceholder")} numberOfLines={2} />
            </View>

            <View className="flex-row justify-end gap-2">
              <Button variant="outline" onPress={() => setBooking(false)} disabled={send.isPending}>
                <Text>{t("classRequests.cancel")}</Text>
              </Button>
              <Button onPress={() => send.mutate()} disabled={send.isPending || !coachId || !slot} testID="class-request-send">
                <Text>{t("classRequests.send")}</Text>
              </Button>
            </View>
          </View>
        ) : null}

        {requests.isPending ? (
          <Text className="text-sm text-muted-foreground">…</Text>
        ) : requests.isError ? (
          <Text className="text-sm text-destructive">{t("classRequests.loadFailed")}</Text>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-muted-foreground">{t("classRequests.empty")}</Text>
        ) : (
          <View className="gap-2">
            {open.map(renderRow)}
            {closed.length > 0 ? (
              <View className="gap-2">
                <Pressable onPress={() => setShowClosed((v) => !v)} className="flex-row items-center gap-1 py-1">
                  <Ionicons name={showClosed ? "chevron-down" : "chevron-forward"} size={14} color={lightTheme.mutedForeground} />
                  <Text className="text-sm text-muted-foreground">
                    {t("classRequests.history")} ({closed.length})
                  </Text>
                </Pressable>
                {showClosed ? closed.map(renderRow) : null}
              </View>
            ) : null}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
