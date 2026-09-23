import { Ionicons } from "@expo/vector-icons";
import { classRowCompetencies, classRowSummary, lightTheme } from "@levelup/config";
import { useClassEvaluations, useEvaluationCompetencies, useHeldWhile, usePutEvaluationRecord } from "@levelup/hooks";
import type { ClassEvaluationParticipant, EvaluationClassRef, EvaluationCompetency } from "@levelup/types";
import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";

import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

import { EvaluationForm } from "./evaluation-form";
import { HistoryCard } from "./history-card";
import { openCompetencyManager } from "./open-competency-manager";

interface ClassEvaluationsScreenProps {
  /** The dated occurrence, addressed as `POST /class_instance` addresses it. */
  classRef: EvaluationClassRef;
  className: string;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

/**
 * "Avaliações — {aula}" on iOS (evaluations.class-panel, PAD-376): a PUSHED screen, not
 * a native Modal — the same accordion as web's `ClassEvaluationsPanel`, on the same
 * shared rules. The server says who is listed, in what order (absent last) and which
 * record a row shows (Q28). The screen is a route, so its state dies with it (rule 9).
 */
export function ClassEvaluationsScreen({ classRef, className }: ClassEvaluationsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const read = useClassEvaluations(classRef);
  const known = useEvaluationCompetencies();
  const [openId, setOpenId] = React.useState<number | null>(null);

  const participants = read.data?.participants;
  // Nothing may move under an open form: the ORDER is held while a row is open; each row's data still follows.
  const latestOrder = React.useMemo(() => participants?.map((p) => p.playerId), [participants]);
  const order = useHeldWhile(latestOrder, openId !== null, `${classRef.model}:${classRef.id}:${classRef.date ?? ""}`);
  const rows = React.useMemo(() => {
    const byId = new Map((participants ?? []).map((p) => [p.playerId, p]));
    const held = (order ?? []).flatMap((id) => byId.get(id) ?? []);
    const added = (participants ?? []).filter((p) => !(order ?? []).includes(p.playerId));
    return [...held, ...added];
  }, [order, participants]);

  const manage = () => openCompetencyManager(router);

  return (
    <Screen edges={["top"]} testID="class-evaluations-panel">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" testID="class-eval-back"
          accessibilityLabel={t("players.classEvaluations.back")} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
        </Button>
        <Text role="heading" aria-level={1} className="flex-1 text-xl font-bold" numberOfLines={1} testID="class-eval-title">
          {t("players.classEvaluations.title", { name: className })}
        </Text>
        <Button variant="ghost" size="icon" testID="class-eval-manage-header"
          accessibilityLabel={t("players.classEvaluations.manage")} onPress={manage}>
          <Ionicons name="options-outline" size={22} color={lightTheme.foreground} />
        </Button>
      </View>

      <KeyboardAvoidingView behavior={keyboardAvoidingBehavior()} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-12">
          {read.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {read.isError ? (
            <ErrorState message={t("players.classEvaluations.loadError")} onRetry={() => void read.refetch()} />
          ) : null}
          {read.data && rows.length === 0 ? (
            <Text className="text-sm text-muted-foreground" testID="class-eval-no-participants">
              {t("players.classEvaluations.noParticipants")}
            </Text>
          ) : null}

          {read.data && rows.length > 0 ? (
            <View className="rounded-lg border border-border bg-card">
              {rows.map((participant, index) => (
                <ParticipantRow
                  key={participant.playerId}
                  first={index === 0}
                  participant={participant}
                  classRef={classRef}
                  active={read.data.competencies}
                  known={known.data?.competencies}
                  open={openId === participant.playerId}
                  onToggle={() => setOpenId((now) => (now === participant.playerId ? null : participant.playerId))}
                  onManage={manage}
                />
              ))}
            </View>
          ) : null}

          <Button variant="outline" onPress={manage} testID="class-eval-manage-footer">
            <Ionicons name="add" size={16} color={lightTheme.foreground} />
            <Text>{t("players.classEvaluations.manage")}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface ParticipantRowProps {
  first: boolean;
  participant: ClassEvaluationParticipant;
  classRef: EvaluationClassRef;
  active: EvaluationCompetency[];
  /** The coach's whole set, switched-off ones included; undefined while it loads. */
  known: EvaluationCompetency[] | undefined;
  open: boolean;
  onToggle: () => void;
  onManage: () => void;
}

function ParticipantRow({ first, participant, classRef, active, known, open, onToggle, onManage }: ParticipantRowProps) {
  const { t } = useTranslation();
  const id = participant.playerId;
  const put = usePutEvaluationRecord(String(id));
  const record = participant.record;
  const summary = classRowSummary(active, record);
  // Today's record is edited in place; an earlier day's is shown read-only and the form
  // starts empty — its first tap starts today's record for the same occurrence.
  const todays = record?.editable ? record : null;
  // Nothing drawn above the form changes shape in answer to a tap (Q33): the first tap makes
  // TODAY's record the row's most recent one (Q28) and the earlier-day card would unmount,
  // dropping the form under the finger. The card is held while the row is open; closing
  // the row releases it. The form's session is created once, so today's id arriving does
  // not touch what the coach is editing.
  // (useHeldWhile passes `undefined` through as "not loaded yet" but holds `null`; a row can only be
  // opened once the read that carries its record has answered, so `null` here means "no earlier
  // record", never "loading". If rows ever become openable while loading, hold `undefined` instead.)
  const earlier = useHeldWhile(record && !record.editable ? record : null, open, `${id}:${open}`);
  const rowCompetencies = known ? classRowCompetencies(active, todays, known) : [];

  return (
    <View className={first ? "" : "border-t border-border"} testID={`class-eval-row-${id}`}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={participant.name} testID={`class-eval-row-toggle-${id}`}
        className="min-h-14 flex-row items-center gap-3 px-3 py-2">
        <Avatar alt={participant.name} className="h-9 w-9">
          <AvatarFallback>
            <Text className="text-xs">{initials(participant.name)}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="shrink text-sm font-medium" numberOfLines={1}>{participant.name}</Text>
            {participant.absent ? (
              <Badge variant="secondary" testID={`class-eval-absent-${id}`}>
                <Text>{t("calendar.attendance.absent")}</Text>
              </Badge>
            ) : null}
            {/* evaluations.reminders rule 4 (PAD-404): the server's `due`. */}
            {participant.due === true ? (
              <Badge variant="outline" className="border-primary/40" testID={`class-eval-due-${id}`}
                accessibilityLabel={t("evaluations.reminder.dueLabel")}>
                <Text className="text-primary">{t("evaluations.reminder.dueLabel")}</Text>
              </Badge>
            ) : null}
          </View>
          {/* The counts ride in the testID: Maestro reads ids, and the copy differs by locale. */}
          <Text className="text-xs text-muted-foreground" testID={`class-eval-summary-${id}-${summary.rated}-${summary.total}`}>
            {summary.rated > 0
              ? t("players.classEvaluations.summaryRated", { rated: summary.rated, total: summary.total })
              : t("players.classEvaluations.summaryNone")}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={lightTheme.mutedForeground} />
      </Pressable>

      {open ? (
        <View className="gap-4 px-3 pb-4">
          {!known ? <Skeleton className="h-32 w-full" /> : null}
          {known && earlier ? (
            <View testID={`class-eval-earlier-${id}`}>
              <HistoryCard record={earlier} />
            </View>
          ) : null}
          {known && rowCompetencies.length === 0 ? (
            // Never a note-only form (rule 6, AV-071).
            <View className="items-center gap-3 rounded-lg border border-dashed border-border p-4" testID="class-eval-empty">
              <Text className="text-center text-sm text-muted-foreground">{t("players.evaluationHistory.noCompetencies")}</Text>
              <Button variant="outline" size="sm" onPress={onManage} testID="class-eval-empty-manage">
                <Text>{t("players.classEvaluations.manage")}</Text>
              </Button>
            </View>
          ) : null}
          {known && rowCompetencies.length > 0 ? (
            <EvaluationForm
              competencies={rowCompetencies}
              record={todays}
              onSave={(input) => put.mutateAsync({ ...input, classRef })}
              onClose={onToggle}
              onManageCompetencies={onManage}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
