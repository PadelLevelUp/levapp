import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import {
  effectiveMark,
  fromMark,
  undecidedCount,
  type PresenceMark,
} from "@levelup/config";
import type {
  PendingValidationClass,
  PendingValidationPlayer,
} from "@levelup/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PresenceMarkToggle } from "./PresenceMarkToggle";
import type { ValidatePayload } from "./hooks";

type Edits = Record<number, Record<number, PresenceMark>>;

/**
 * PAD-140 — the coach's attendance inbox on iOS.
 *
 * Same model as the web dialog: classes that have already run, browsed a week
 * at a time, split into "ready to confirm" (everyone answered) and "needs your
 * input". Marks live in local `edits` state layered over the stored value and
 * the response-based prefill (`@levelup/config`), and nothing persists until
 * Validate.
 *
 * Two deliberate differences from web, both presentation:
 *   * no bulk multi-select — on a phone, tapping through classes one at a time
 *     is faster than managing a selection, and the "skipped N classes" notice
 *     that bulk exists to produce has nowhere good to live;
 *   * one class expanded at a time, so a roster of 6 players does not push the
 *     next class off-screen.
 */
export function ValidateClassesSheet({
  open,
  onOpenChange,
  pending,
  validated,
  weekOffset,
  onWeekChange,
  loading,
  onValidate,
  onUnvalidate,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: PendingValidationClass[];
  validated: PendingValidationClass[];
  weekOffset: number;
  onWeekChange: (next: number) => void;
  loading?: boolean;
  onValidate: (classes: ValidatePayload[]) => Promise<void>;
  onUnvalidate: (lessonInstanceId: number) => Promise<void>;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [edits, setEdits] = React.useState<Edits>({});
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const remainingFor = (klass: PendingValidationClass) =>
    undecidedCount(klass.players, edits[klass.lessonInstanceId] ?? {});

  function setMark(classId: number, playerId: number, mark: PresenceMark) {
    setEdits((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] ?? {}), [playerId]: mark },
    }));
  }

  async function validateOne(klass: PendingValidationClass) {
    const classEdits = edits[klass.lessonInstanceId] ?? {};
    const presences = klass.players.flatMap((player) => {
      const mark = effectiveMark(player, classEdits[player.playerId]);
      return mark ? [{ playerId: player.playerId, ...fromMark(mark) }] : [];
    });
    await onValidate([{ lessonInstanceId: klass.lessonInstanceId, presences }]);
    setExpandedId(null);
  }

  const weekLabel = React.useMemo(() => {
    // UTC throughout, matching `weekBounds` — the label must name the same week
    // the screen actually queried.
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7;
    const monday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - dow + weekOffset * 7
      )
    );
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const name =
      weekOffset === 0
        ? t("presences.week.this")
        : weekOffset === -1
          ? t("presences.week.last")
          : weekOffset === 1
            ? t("presences.week.next")
            : t("presences.week.offset", {
                offset: weekOffset > 0 ? `+${weekOffset}` : weekOffset,
              });
    return `${name} · ${fmt.format(monday)} – ${fmt.format(sunday)}`;
  }, [weekOffset, i18n.language, t]);

  const needsInput = pending.filter((c) => remainingFor(c) > 0);
  const ready = pending.filter((c) => remainingFor(c) === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88%] w-[92%]">
        <DialogHeader>
          <DialogTitle>{t("presences.validate.title")}</DialogTitle>
        </DialogHeader>

        <View className="mb-3 flex-row items-center justify-between rounded-lg border border-border bg-muted/40 px-2 py-1.5">
          <Pressable
            onPress={() => onWeekChange(weekOffset - 1)}
            testID="presences-week-prev"
            accessibilityRole="button"
            accessibilityLabel={t("presences.week.previous")}
            className="p-2"
          >
            <Ionicons name="chevron-back" size={18} color={lightTheme.foreground} />
          </Pressable>
          <Text className="text-sm font-sans-bold" testID="presences-week-label">
            {weekLabel}
          </Text>
          <Pressable
            onPress={() => onWeekChange(weekOffset + 1)}
            testID="presences-week-next"
            accessibilityRole="button"
            accessibilityLabel={t("presences.week.next")}
            className="p-2"
          >
            <Ionicons name="chevron-forward" size={18} color={lightTheme.foreground} />
          </Pressable>
        </View>

        <ScrollView className="max-h-[70%]">
          {loading ? (
            <View className="gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </View>
          ) : pending.length === 0 ? (
            <Text
              testID="presences-validate-empty"
              className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
            >
              {t("presences.validate.empty")}
            </Text>
          ) : (
            <View className="gap-4">
              {[
                { key: "needsInput" as const, items: needsInput },
                { key: "ready" as const, items: ready },
              ]
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <View key={group.key} className="gap-2">
                    <Text className="text-xs uppercase text-muted-foreground">
                      {t(`presences.validate.group.${group.key}`, {
                        count: group.items.length,
                      })}
                    </Text>
                    {group.items.map((klass) => (
                      <ClassCard
                        key={klass.lessonInstanceId}
                        klass={klass}
                        remaining={remainingFor(klass)}
                        edits={edits[klass.lessonInstanceId] ?? {}}
                        expanded={expandedId === klass.lessonInstanceId}
                        busy={busy}
                        onToggleExpand={() =>
                          setExpandedId((cur) =>
                            cur === klass.lessonInstanceId
                              ? null
                              : klass.lessonInstanceId
                          )
                        }
                        onMark={(playerId, mark) =>
                          setMark(klass.lessonInstanceId, playerId, mark)
                        }
                        onValidate={() => validateOne(klass)}
                      />
                    ))}
                  </View>
                ))}
            </View>
          )}

          {validated.length > 0 && (
            <View className="mt-4 gap-2">
              <Text className="text-xs uppercase text-muted-foreground">
                {t("presences.validate.validatedThisWeek")}
              </Text>
              {validated.map((klass) => (
                <View
                  key={klass.lessonInstanceId}
                  className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <View className="flex-1 flex-row items-center gap-2 pr-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={lightTheme.success ?? lightTheme.primary}
                    />
                    <Text className="flex-1 text-sm" numberOfLines={1}>
                      {klass.title}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() => onUnvalidate(klass.lessonInstanceId)}
                    testID={`presences-undo-${klass.lessonInstanceId}`}
                  >
                    <Text>{t("presences.validate.undo")}</Text>
                  </Button>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
}

function ClassCard({
  klass,
  remaining,
  edits,
  expanded,
  busy,
  onToggleExpand,
  onMark,
  onValidate,
}: {
  klass: PendingValidationClass;
  remaining: number;
  edits: Record<number, PresenceMark>;
  expanded: boolean;
  busy?: boolean;
  onToggleExpand: () => void;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onValidate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <View
      testID="presences-class-card"
      accessibilityLabel={klass.title}
      accessibilityValue={{ text: remaining === 0 ? "ready" : "needs-input" }}
      className="rounded-lg border border-border bg-card p-3"
    >
      {/* The header row toggles expansion. The Validate button sits OUTSIDE it —
          nesting a Pressable inside a Pressable breaks touch handling on iOS. */}
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between"
      >
        <View className="flex-1 pr-2">
          <Text className="text-sm font-sans-bold" numberOfLines={1}>
            {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))} ·{" "}
            {klass.title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {klass.type ? t(`presences.type.${klass.type}`) : null}
            {remaining > 0
              ? ` · ${t("presences.validate.awaiting", { count: remaining })}`
              : null}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={lightTheme.mutedForeground}
        />
      </Pressable>

      {expanded && (
        <View className="mt-3 gap-2">
          {sortPlayers(klass.players, edits).map((player) => (
            <View
              key={player.playerId}
              className="flex-row items-center justify-between gap-2"
            >
              <View className="flex-1 pr-1">
                <Text className="text-sm" numberOfLines={1}>
                  {player.name}
                </Text>
                {player.guest && (
                  <Text className="text-[10px] text-muted-foreground">
                    {t("presences.guest")}
                  </Text>
                )}
              </View>
              <PresenceMarkToggle
                playerName={player.name}
                value={effectiveMark(player, edits[player.playerId])}
                onChange={(mark) => onMark(player.playerId, mark)}
              />
            </View>
          ))}

          <Button
            className="mt-2"
            disabled={remaining > 0 || busy}
            onPress={onValidate}
            testID="presences-validate-class"
          >
            <Text>{t("presences.validate.validate")}</Text>
          </Button>
        </View>
      )}
    </View>
  );
}

/** Undecided players first — the coach should see what is blocking them. */
function sortPlayers(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark>
) {
  return [...players].sort((a, b) => {
    const aDone = effectiveMark(a, edits[a.playerId]) !== null;
    const bDone = effectiveMark(b, edits[b.playerId]) !== null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
