/**
 * PAD-547 (calendar.event-detail rules 19–20, notifications.waiting-list rules 18–21) — iOS port of
 * web's ClassWaitingListSection: the class's waiting list with each row's origin, a remove control,
 * and "Add to waiting list" for this class only or the whole series. Coach only. In-app controls
 * with test ids throughout (PAD-320: Maestro asserts by id).
 */
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_STANDING_PRESET,
  STANDING_PRESETS,
  describeIneligible,
  lightTheme,
  resolveText,
  standingEndFor,
  standingPresetOf,
  waitingListCandidates,
  waitingListOriginKey,
} from "@levelup/config";
import * as notificationEngineApi from "@levelup/api/src/resources/notificationEngine";
import type { CoachClassWaitingListRow, EligibilityCheckEntry } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useCoachPlayers } from "@/features/players/hooks";

interface Props {
  event: { model: string; originalId: string | number; date?: string | null };
  isRecurring: boolean;
  rows: CoachClassWaitingListRow[];
  enrolledIds: Array<string | number>;
  onChanged: () => void;
}

export function ClassWaitingListSection({ event, isRecurring, rows, enrolledIds, onChanged }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(rows.length > 0);
  const [adding, setAdding] = React.useState(false);

  const remove = async (row: CoachClassWaitingListRow) => {
    try {
      await notificationEngineApi.removeFromClassWaitingList(row.id);
      onChanged();
    } catch {
      toast.error(t("common.somethingWentWrong"));
    }
  };

  return (
    <View className="gap-2" testID="class-waiting-list">
      <Pressable
        testID="class-waiting-list-toggle"
        role="button"
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center justify-between py-1"
      >
        <Text className="text-sm font-semibold">{t("calendar.detail.waitingList", { count: rows.length })}</Text>
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={lightTheme.mutedForeground} />
      </Pressable>
      {open ? (
        <View className="gap-1.5">
          {rows.length === 0 ? (
            <Text className="text-xs text-muted-foreground">{t("calendar.detail.waitingListEmpty")}</Text>
          ) : (
            rows.map((row) => (
              <View
                key={row.id}
                testID={`class-waiting-list-row-${row.playerId}-${row.origin}`}
                className="flex-row items-center justify-between py-1"
              >
                <View className="flex-1">
                  <Text className="text-sm" numberOfLines={1}>{row.playerName}</Text>
                  <Text className="text-[11px] text-muted-foreground">{t(waitingListOriginKey(row))}</Text>
                </View>
                <Pressable
                  testID={`class-waiting-list-remove-${row.playerId}`}
                  accessibilityLabel={t("calendar.detail.waitingListRemove")}
                  role="button"
                  hitSlop={8}
                  onPress={() => void remove(row)}
                  className="h-7 w-7 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={lightTheme.mutedForeground} />
                </Pressable>
              </View>
            ))
          )}
          <Button size="sm" variant="outline" testID="class-waiting-list-add" onPress={() => setAdding(true)}>
            <Text>{t("calendar.detail.waitingListAdd")}</Text>
          </Button>
        </View>
      ) : null}
      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        event={event}
        isRecurring={isRecurring}
        rows={rows}
        enrolledIds={enrolledIds}
        onAdded={() => {
          setAdding(false);
          setOpen(true);
          onChanged();
        }}
      />
    </View>
  );
}

function AddDialog({
  open,
  onClose,
  event,
  isRecurring,
  rows,
  enrolledIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  event: Props["event"];
  isRecurring: boolean;
  rows: CoachClassWaitingListRow[];
  enrolledIds: Array<string | number>;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const { data: roster } = useCoachPlayers({ enabled: open });
  const candidates = React.useMemo(
    () => waitingListCandidates(roster ?? [], enrolledIds, rows),
    [roster, enrolledIds, rows]
  );
  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<"occurrence" | "series">("occurrence");
  const [today, setToday] = React.useState(() => new Date());
  const [expiresOn, setExpiresOn] = React.useState(() => standingEndFor(DEFAULT_STANDING_PRESET, new Date()));
  const [credits, setCredits] = React.useState(3);
  const [ineligible, setIneligible] = React.useState<EligibilityCheckEntry[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setExpiresOn(standingEndFor(DEFAULT_STANDING_PRESET, now));
    setPlayerId(null);
    setScope("occurrence");
    setCredits(3);
  }, [open]);

  // Rule 20: mark who would fail the class's bar today, as the class editor's picker does.
  React.useEffect(() => {
    if (!open || candidates.length === 0) return;
    notificationEngineApi
      .checkEligibility(event.model, String(event.originalId), event.date, candidates.map((c) => c.playerId))
      .then(({ ineligible: failing }) => setIneligible(failing))
      .catch(() => setIneligible([]));
  }, [open, candidates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reasonsById = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of describeIneligible(ineligible)) map.set(String(s.playerId), s.reasons.map((r) => resolveText(t, r)));
    return map;
  }, [ineligible, t]);
  const preset = standingPresetOf(expiresOn, today);

  const confirm = async () => {
    if (!playerId) return;
    setSaving(true);
    try {
      const result = await notificationEngineApi.addToClassWaitingList({
        model: event.model,
        originalId: event.originalId,
        date: event.date,
        playerId: Number(playerId),
        scope,
        ...(scope === "series" ? { credits, expiresOn } : {}),
      });
      if (result.action === "already_on_list") toast.warning(t("calendar.detail.waitingListAlready"));
      onAdded();
    } catch {
      toast.error(t("calendar.detail.waitingListAddFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent testID="class-waiting-list-dialog">
        <DialogHeader>
          <DialogTitle>{t("calendar.detail.waitingListAdd")}</DialogTitle>
        </DialogHeader>
        <ScrollView style={{ maxHeight: 360 }}>
          <View className="gap-1">
            {candidates.map((c) => {
              const reasons = reasonsById.get(String(c.playerId));
              const chosen = playerId === String(c.playerId);
              return (
                <Pressable
                  key={c.playerId}
                  testID={`class-waiting-list-candidate-${c.playerId}`}
                  role="button"
                  onPress={() => setPlayerId(String(c.playerId))}
                  className={`rounded-md border px-3 py-2 ${chosen ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <Text className="text-sm">{c.name}</Text>
                  {reasons ? (
                    <View testID={`class-waiting-list-ineligible-${c.playerId}`}>
                      <Text className="text-[11px] text-warning">{t("calendar.detail.waitingListIneligibleHint")}</Text>
                      {reasons.map((r, i) => (
                        <Text key={i} className="text-[11px] text-muted-foreground">• {r}</Text>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View className="gap-2">
          <Text className="text-sm font-medium">{t("calendar.detail.waitingListScope")}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant={scope === "occurrence" ? "default" : "outline"}
              testID="class-waiting-list-scope-occurrence"
              onPress={() => setScope("occurrence")}
            >
              <Text>{t("calendar.detail.waitingListScopeOccurrence")}</Text>
            </Button>
            {isRecurring ? (
              <Button
                size="sm"
                variant={scope === "series" ? "default" : "outline"}
                testID="class-waiting-list-scope-series"
                onPress={() => setScope("series")}
              >
                <Text>{t("calendar.detail.waitingListScopeSeries")}</Text>
              </Button>
            ) : null}
          </View>
          {scope === "series" ? (
            <View className="gap-2">
              <Text className="text-sm font-medium">{t("players.endDate")}</Text>
              <View className="flex-row flex-wrap gap-2">
                {STANDING_PRESETS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    testID={`class-waiting-list-preset-${opt.key}`}
                    role="button"
                    onPress={() => setExpiresOn(standingEndFor(opt.key, today))}
                    className={`rounded-md border px-3 py-1.5 ${preset === opt.key ? "border-primary bg-primary" : "border-border"}`}
                  >
                    <Text className={`text-sm ${preset === opt.key ? "text-primary-foreground" : ""}`}>{t(opt.labelKey)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-sm font-medium">{t("players.maxClassesToFill")}</Text>
              <View className="flex-row items-center gap-3">
                <Button size="sm" variant="outline" testID="class-waiting-list-credits-minus" onPress={() => setCredits((c) => Math.max(1, c - 1))}>
                  <Text>−</Text>
                </Button>
                <Text testID="class-waiting-list-credits" className="w-6 text-center text-sm font-medium">{credits}</Text>
                <Button size="sm" variant="outline" testID="class-waiting-list-credits-plus" onPress={() => setCredits((c) => Math.min(20, c + 1))}>
                  <Text>+</Text>
                </Button>
              </View>
            </View>
          ) : null}
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={onClose} disabled={saving}>
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button testID="class-waiting-list-confirm" onPress={() => void confirm()} disabled={saving || !playerId}>
            <Text>{t("calendar.detail.waitingListAdd")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
